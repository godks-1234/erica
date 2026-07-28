const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    
    const lat = location?.lat || 37.5665;
    const lon = location?.lon || 126.9780;

    // 1. Open-Meteo 실시간 기상 데이터 (기온, 습도, 바람, weather_code) 가져오기
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
          wind: `${(current.wind_speed_10m / 3.6).toFixed(1)} m/s`, // km/h -> m/s 변환
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
    
    const prompt = `
      사용자의 신체 정보, 위치 정보 및 확장된 날씨 지표를 바탕으로 맞춤형 러닝 가이드를 JSON 포맷으로 생성해주세요.
      
      [분석할 실시간 기상 데이터]
      - 기온: ${realWeather.temp}, 습도: ${realWeather.humidity}, 상태: ${realWeather.condition}
      - 바람: ${realWeather.wind}
      * (참고) 현재 위치의 시간대 및 계절적 특성을 고려하여 '자외선 지수(예: 높음, 보통)' 및 '미세먼지 농도(예: 좋음, 나쁨)'를 AI가 합리적으로 추정하여 분석에 포함시켜 주세요.

      [사용자 정보]
      - 신장: ${height}cm, 체중: ${weight}kg, 숙련도: ${experience}, 컨디션: ${condition}
      - 위치: 위도 ${lat}, 경도 ${lon}

      [코칭 반영 및 예시 출력 지침]
      1. '자외선'과 '바람'에 대해서는 반드시 구체적인 대처 예시를 제공해야 합니다.
         - 자외선 예시: "자외선 지수가 '높음' 단계이므로 30분 전 자외선 차단제 필수 도포, 자외선 차단 선글라스 및 캡모자 착용 권장"
         - 바람 예시: "바람이 ${realWeather.wind}로 다소 강하므로 맞바람 구간에서는 페이스를 15초 낮추고 뒷바람 구간에서 속도를 올리는 윈드 러닝 전략 추천"
      2. 미세먼지 수치에 따른 마스크 착용 여부나 호흡 페이스 조절 가이드를 포함하세요.

      [출력 요구 형식]
      반드시 아래 구조의 순수 JSON 형태로만 답변하세요. 마크다운 블록(\`\`\`json)은 절대 쓰지 마십시오.

      {
        "weatherExtra": {
          "uv": "높음",
          "dust": "보통 (35µg/m³)"
        },
        "metrics": {
          "time": "42:00",
          "distance": "5.5 km"
        },
        "routeCoordinates": [
          [${lat}, ${lon}],
          [${lat + 0.002}, ${lon + 0.002}],
          [${lat + 0.004}, ${lon + 0.001}],
          [${lat}, ${lon}]
        ],
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "웜업 스트레칭 및 가벼운 조깅 시작",
            "isAlert": false,
            "alertText": ""
          },
          {
            "time": "15:00 - 30:00",
            "content": "본격 페이스 러닝 구간",
            "isAlert": true,
            "alertText": "현재 자외선이 강하니 그늘막이 확보되는 천변 우측 코스를 이용하세요. 맞바람이 불 때는 상체를 약간 숙이십시오."
          }
        ],
        "descriptionMarkdown": "<h3>🗺️ 주변 코스 및 통합 날씨 가이드</h3><p>현재 날씨 조건(바람, 자외선, 미세먼지)을 반영한 맞춤 가이드입니다...</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const parsedData = JSON.parse(result.response.text().trim());

    // 실시간 날씨 원본 데이터도 함께 프론트로 전송
    parsedData.weatherReal = realWeather;

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
