const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    const lat = location?.lat || 37.5665;
    const lon = location?.lon || 126.9780;

    // [1] Open-Meteo 실시간 기상 데이터 가져오기
    let realWeather = { temp: "24°", humidity: "60%", wind: "2.5 m/s", rainProb: "10%", condition: "맑음" };
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_hours=1`);
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        const current = weatherData.current;
        const hourly = weatherData.hourly;
        
        let weatherText = "맑음";
        if (current.weather_code >= 1 && current.weather_code <= 3) weatherText = "구름 조금";
        else if (current.weather_code >= 51 && current.weather_code <= 67) weatherText = "비/이슬비";
        else if (current.weather_code >= 80) weatherText = "소나기";

        const prob = hourly?.precipitation_probability?.[0] !== undefined ? `${hourly.precipitation_probability[0]}%` : "0%";

        realWeather = {
          temp: `${Math.round(current.temperature_2m)}°`,
          humidity: `${current.relative_humidity_2m}%`,
          wind: `${(current.wind_speed_10m / 3.6).toFixed(1)} m/s`,
          rainProb: prob,
          condition: weatherText
        };
      }
    } catch (e) { console.error("날씨 호출 실패:", e); }

    // [2] OSRM 실제 도로망 내비게이션 엔진 연동
    const wp1_lat = lat + 0.002; const wp1_lon = lon + 0.001;
    const wp2_lat = lat + 0.001; const wp2_lon = lon + 0.003;
    let actualRouteCoordinates = [];
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${lon},${lat};${wp1_lon},${wp1_lat};${wp2_lon},${wp2_lat};${lon},${lat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          actualRouteCoordinates = osrmData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        }
      }
    } catch (e) { console.error(e); }

    if (actualRouteCoordinates.length === 0) {
      actualRouteCoordinates = [[lat, lon], [lat + 0.0015, lon], [lat + 0.0015, lon + 0.002], [lat, lon]];
    }

    // [3] AI 연동 (gemini-3.1-flash-lite 버전 고정 적용)
    const aiKey = process.env.GEMINI_API_KEY;
    if (!aiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY 환경 변수가 누락되었습니다.' });
    }

    const ai = new GoogleGenerativeAI(aiKey);
    // 💡 요청하신 gemini-3.1-flash-lite 모델명으로 변경 및 고정
    const model = ai.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      사용자의 신체조건과 실시간 기상 데이터를 결합하여 오늘의 러닝 효율성 점수 및 코칭 가이드를 JSON 포맷으로 생성해주세요.

      [사용자 데이터]
      - 신장: ${height}cm, 체중:${weight}kg
      - 숙련도: ${experience}, 컨디션: ${condition}

      [기상 데이터]
      - 기온: ${realWeather.temp}, 습도: ${realWeather.humidity}, 바람:${realWeather.wind}, 상태: ${realWeather.condition}, 강수확률: ${realWeather.rainProb}

      반드시 아래 형식의 순수 JSON으로만 출력하세요. 마크다운 블록은 금지합니다.
      {
        "runningScore": 85,
        "scoreComment": "현재 신체 스펙에 최적화된 심박 구간 리듬 러닝을 제안합니다.",
        "weatherExtra": { "uv": "보통", "dust": "좋음" },
        "metrics": { "time": "35:00", "distance": "3.8 km" },
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "신체 관절 보호를 위한 슬로우 웜업 조깅",
            "isAlert": true,
            "alertText": "현재 비 올 확률이 ${realWeather.rainProb}이므로 지면 미끄러짐에 주의하시고, 바람 대처를 위해 맞바람 시 상체를 5도 기울이세요."
          }
        ],
        "descriptionMarkdown": "<h3>🏃 신체 피드백 결과</h3><p>분석 완료되었습니다.</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().trim();
    
    // JSON 파싱 검증 및 전송
    const parsedData = JSON.parse(textResponse);
    parsedData.routeCoordinates = actualRouteCoordinates;
    parsedData.weatherReal = realWeather;

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error Details:", error);
    return res.status(500).json({ 
      error: '서버 내부 오류가 발생했습니다.', 
      details: error.message 
    });
  }
}
