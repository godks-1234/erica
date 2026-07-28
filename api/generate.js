const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    
    const lat = location?.lat || 37.5665;
    const lon = location?.lon || 126.9780;

    // 1. Open-Meteo 실시간 기상 데이터 가져오기
    let realWeather = { temp: "24°C", humidity: "60%", wind: "2.5 m/s", condition: "맑음" };
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`);
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        const current = weatherData.current;
        
        let weatherText = "맑음";
        if (current.weather_code >= 1 && current.weather_code <= 3) weatherText = "구름 조금";
        else if (current.weather_code >= 51 && current.weather_code <= 67) weatherText = "비/이슬비";
        else if (current.weather_code >= 80) weatherText = "소나기";

        realWeather = {
          temp: `${Math.round(current.temperature_2m)}°`,
          humidity: `${current.relative_humidity_2m}%`,
          wind: `${(current.wind_speed_10m / 3.6).toFixed(1)} m/s`,
          condition: weatherText
        };
      }
    } catch (e) {
      console.error("날씨 API 호출 실패:", e);
    }

    // 2. AI 초기화
    const aiKey = process.env.GEMINI_API_KEY;
    if (!aiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' });
    }
    
    const ai = new GoogleGenerativeAI(aiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    // 💡 프롬프트 수정: 신체 조건 핵심 반영 + 건물 우회 실제 산책로/도로 좌표 요청
    const prompt = `
      사용자의 신체조건(신장, 체중, 숙련도, 컨디션)을 1순위로 고려하고, 실시간 날씨를 결합하여 맞춤형 러닝 가이드를 생성해주세요.

      [사용자 신체 및 성향 데이터]
      - 신장: ${height}cm, 체중: ${weight}kg
      - 러닝 숙련도: ${experience} (초급자는 걷기/뛰기 인터벌 필수, 상급자는 빌드업/지속주 위주)
      - 오늘 컨디션: ${condition}
      - 현재 위치: 위도 ${lat}, 경도 ${lon}

      [실시간 기상 데이터]
      - 기온: ${realWeather.temp}, 습도: ${realWeather.humidity}, 상태: ${realWeather.condition}, 바람: ${realWeather.wind}
      * 날씨 외에 '자외선 지수(예: 높음)', '미세먼지(예: 보통)'를 합리적으로 추정해 포함하십시오.

      [핵심 요구사항]
      1. 지형 및 건물 우회 (지도 경로선):
         - routeCoordinates 배열에 절대 건물을 관통하는 직선을 주지 마십시오.
         - 제공된 위도(${lat})와 경도(${lon}) 주변의 실제 인도, 천변 산책로, 혹은 큰 공원 둘레길 지형을 상상하여 도로망을 따라 꺾이는 정교한 6~9개의 좌표쌍([위도, 경도])을 격자 형태로 우회하듯 부드럽게 설계하세요. (직선 관통 금지)
      2. 사용자 신체 맞춤형 피드백:
         - 체중과 신장 대비 무릎 부담 여부를 판단하여 페이스(속도)와 착지법(미드풋 등)을 피드백에 반영하세요.
         - 숙련도와 컨디션에 따른 타겟 심박수나 구간별 분속 페이스를 구체적으로 처방하세요. 날씨는 거들 뿐, 신체가 중심이어야 합니다.
      3. 자외선과 바람 대처 예시 필수 포함.

      [출력 요구 형식] (순수 JSON 형태)
      {
        "weatherExtra": { "uv": "높음", "dust": "좋음" },
        "metrics": { "time": "35:00", "distance": "3.8 km" },
        "routeCoordinates": [
          [${lat}, ${lon}],
          [${lat + 0.0015}, ${lon}],
          [${lat + 0.0015}, ${lon + 0.002}],
          [${lat + 0.003}, ${lon + 0.002}],
          [${lat + 0.003}, ${lon}],
          [${lat}, ${lon}]
        ],
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "신체 맞춤 워밍업 페이스 조절",
            "isAlert": true,
            "alertText": "현재 과체중 범주 혹은 컨디션을 감안해 무릎 관절 보호를 위해 피치를 짧게 가져가세요. 바람 처방 예시: 맞바람이 부는 구역이므로 상체를 5도 숙이세요."
          }
        ],
        "descriptionMarkdown": "<h3>🏃 신체 분석 기반 맞춤 가이드</h3><p>현재 숙련도와 체격 조건을 고려할 때...</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const parsedData = JSON.parse(result.response.text().trim());
    parsedData.weatherReal = realWeather;

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
