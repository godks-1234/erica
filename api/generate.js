const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    
    // 기본 위치 정보 설정 (사용자 위치가 없을 경우 서울 기준으로 대체)
    const lat = location?.lat || 37.5665;
    const lon = location?.lon || 126.9780;

    // 1. Open-Meteo 무료 API를 이용해 실시간 실제 날씨 데이터 가져오기
    let realWeather = { temp: "정보 없음", humidity: "정보 없음", condition: "정보 없음" };
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`);
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        const current = weatherData.current;
        
        // 날씨 코드(weather_code)를 직관적인 텍스트로 변환
        let weatherText = "무난함";
        if (current.weather_code >= 1 && current.weather_code <= 3) weatherText = "대체로 맑음 또는 구름 조금";
        else if (current.weather_code >= 45 && current.weather_code <= 48) weatherText = "안개";
        else if (current.weather_code >= 51 && current.weather_code <= 67) weatherText = "비 또는 이슬비";
        else if (current.weather_code >= 71 && current.weather_code <= 77) weatherText = "눈";
        else if (current.weather_code >= 80) weatherText = "소나기 또는 뇌우";

        realWeather = {
          temp: `${current.temperature_2m}°C`,
          humidity: `${current.relative_humidity_2m}%`,
          condition: weatherText
        };
      }
    } catch (e) {
      console.error("날씨 API 호출 실패(기본값 사용):", e);
    }

    // 2. 환경변수 및 AI 초기화
    const aiKey = process.env.GEMINI_API_KEY;
    if (!aiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' });
    }
    
    const ai = new GoogleGenerativeAI(aiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    // 프롬프트에 '실제 날씨 데이터' 주입
    const prompt = `
      사용자의 위치, 신체 정보 및 실시간 실제 날씨 데이터를 바탕으로 맞춤형 러닝 경로, 페이스 조절 및 타임라인 피드백을 JSON 포맷으로 생성해주세요.

      [사용자 정보]
      - 신장: ${height}cm, 체중: ${weight}kg
      - 러닝 경험 수준: ${experience}
      - 오늘 컨디션: ${condition}
      - 사용자 위치 위경도: 위도 ${lat}, 경도 ${lon}

      [API 실시간 날씨 상황]
      - 기온: ${realWeather.temp}
      - 습도: ${realWeather.humidity}
      - 종합 날씨: ${realWeather.condition}

      [출력 요구 형식]
      반드시 아래 구조의 순수 JSON 형태로만 답변하세요. 마크다운 블록(\`\`\`json)은 절대 쓰지 마십시오.

      {
        "metrics": {
          "time": "40:00",
          "distance": "5.2 km"
        },
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "웜업 걷기 및 가벼운 조깅 페이스 (7'30\\\")",
            "isAlert": false,
            "alertText": ""
          },
          {
            "time": "05:00 - 20:00",
            "content": "본격 러닝 리듬 유지 페이스 (6'00\\\")",
            "isAlert": true,
            "alertText": "현재 습도와 기온을 고려한 맞춤 주의사항을 여기에 넣어주세요."
          }
        ],
        "descriptionMarkdown": "<h3>⛅ 날씨 분석 & 신체 매칭</h3><p>현재 날씨 기상에 맞춘 적정 심박수 제안...</p><h3>🗺️ 주변 추천 러닝 경로</h3><p>주변 코스 추천...</p><h3>🏃 페이스 조절 가이드</h3><p>목표 속도 및 리듬 호흡법 설명...</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const parsedData = JSON.parse(responseText);

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
