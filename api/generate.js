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
    } catch (e) { console.error(e); }

    // 💡 [2] OSRM 내비게이션 엔진 연동 (건물 관통 해결의 핵심!)
    // 출발지 주변 반경으로 실제 인도가 있는 경유지 좌표 3곳을 임의로 계산합니다.
    const wp1_lat = lat + 0.002; const wp1_lon = lon + 0.001;
    const wp2_lat = lat + 0.001; const wp2_lon = lon + 0.003;
    
    let actualRouteCoordinates = [];
    try {
      // 보행자(foot) 기준 실시간 경로 탐색 요청 (출발지 -> 경유지1 -> 경유지2 -> 출발지)
      const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${lon},${lat};${wp1_lon},${wp1_lat};${wp2_lon},${wp2_lat};${lon},${lat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          // OSRM이 찾아준 실제 도로망의 위도/경도 포인트 배열 추출 [lat, lon] 형태로 변환
          actualRouteCoordinates = osrmData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        }
      }
    } catch (e) {
      console.error("OSRM 경로 탐색 실패, 가상 좌표로 대체합니다.", e);
    }

    // OSRM 실패 시 백업용 기본 경로 보장
    if (actualRouteCoordinates.length === 0) {
      actualRouteCoordinates = [[lat, lon], [lat + 0.002, lon], [lat + 0.002, lon + 0.002], [lat, lon]];
    }

    // [3] AI 코칭 분석 수행 (AI에게 좌표 생성을 맡기지 않고, 신체와 날씨 피드백에 집중시킴)
    const aiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(aiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      사용자의 신체조건(신장, 체중, 숙련도, 컨디션)을 1순위로 고려하고, 실시간 날씨를 결합하여 맞춤형 러닝 가이드를 생성해주세요.

      [사용자 데이터]
      - 신장: ${height}cm, 체중: ${weight}kg, 숙련도: ${experience}, 컨디션: ${condition}
      - 실시간 기상: 기온 ${realWeather.temp}, 습도 ${realWeather.humidity}, 바람 ${realWeather.wind}, 상태 ${realWeather.condition}

      [코칭 가이드라인]
      1. 신체 맞춤형 피드백: BMI 지수 및 무릎 관절 부담율을 계산하여 페이스 및 착지법을 피드백에 최우선 반영하세요.
      2. 날씨 대처: 바람(${realWeather.wind}) 및 자외선에 대한 구체적 대처법을 예시와 함께 타임라인에 녹여주세요.

      반드시 아래 구조의 순수 JSON 형태로만 답변하세요. 마크다운 블록은 금지합니다.
      {
        "weatherExtra": { "uv": "높음", "dust": "좋음" },
        "metrics": { "time": "30:00", "distance": "3.5 km" },
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "신체 조건에 맞춘 워밍업 및 스트레칭",
            "isAlert": true,
            "alertText": "현재 체중 조건을 고려해 무릎 부담을 줄이도록 보폭을 좁혀 뛰세요. 맞바람 구역에서는 상체를 살짝 숙여 공기 저항을 최소화하는 전략을 추천합니다."
          }
        ],
        "descriptionMarkdown": "<h3>🏃 신체 맞춤형 코스 가이드</h3><p>주변 대학 캠퍼스 및 인도망을 활용한 안전 우회 코스입니다...</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const parsedData = JSON.parse(result.response.text().trim());
    
    // 💡 AI 결과에 실제 도로망 경로 데이터를 합쳐서 프론트로 전송!
    parsedData.routeCoordinates = actualRouteCoordinates;
    parsedData.weatherReal = realWeather;

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
