// GoogleGenAI 대신 GoogleGenerativeAI로 변경합니다.
const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    
    const currentHour = new Date().getHours();
    const mockWeather = {
      temp: currentHour > 18 || currentHour < 6 ? "24°C (야간)" : "31°C (낮 기온 높음, 폭염 주의 필요)",
      humidity: "75%",
      condition: currentHour > 18 ? "맑고 선선한 바람" : "고온 다습, 자외선 강함"
    };

    const aiKey = process.env.GEMINI_API_KEY;
    if (!aiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' });
    }
    
    // 수정된 클래스 명칭으로 생성자를 호출합니다.
    const ai = new GoogleGenerativeAI(aiKey);
    
    // gemini-2.5-flash 모델 가져오기
    const model = ai.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `
      사용자의 위치, 신체 정보 및 실시간 날씨 데이터를 바탕으로 맞춤형 러닝 경로, 페이스 조절 및 타임라인 피드백을 JSON 포맷으로 생성해주세요.

      [사용자 정보]
      - 신장: ${height}cm, 체중: ${weight}kg
      - 러닝 경험 수준: ${experience}
      - 오늘 컨디션: ${condition}
      - 사용자 위치 위경도: 위도 ${location?.lat || 37.5665}, 경도 ${location?.lon || 126.9780}

      [현재 외부 날씨 상황]
      - 기온: ${mockWeather.temp}
      - 습도: ${mockWeather.humidity}
      - 종합 날씨: ${mockWeather.condition}

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
            "alertText": "습도가 높아 땀 배출이 많으니 15분 경과 시점에 가볍게 수분을 섭취하고 페이스를 10초 다운하세요!"
          }
        ],
        "descriptionMarkdown": "<h3>⛅ 날씨 분석 & 신체 매칭</h3><p>현재 기상에 맞춘 적정 심박수 제안...</p><h3>🗺️ 주변 추천 러닝 경로</h3><p>주변 코스 추천...</p><h3>🏃 페이스 조절 가이드</h3><p>목표 속도 및 리듬 호흡법 설명...</p>"
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
