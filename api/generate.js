const { GoogleGenerativeAI } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { height, weight, experience, condition, location } = req.body;
    const lat = location?.lat || 37.5665;
    const lon = location?.lon || 126.9780;

    // [1] Open-Meteo 실시간 기상 데이터 (강수 확률 팝업 추가)
    let realWeather = { temp: "24°", humidity: "60%", wind: "2.5 m/s", rainProb: "10%", condition: "맑음" };
    try {
      // current 항목 외에 강수 확률 확보를 위해 hourly/minutely 대용 혹은 forecast_days 기반 추출 적용
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_hours=1`);
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        const current = weatherData.current;
        const hourly = weatherData.hourly;
        
        let weatherText = "맑음";
        if (current.weather_code >= 1 && current.weather_code <= 3) weatherText = "구름 조금";
        else if (current.weather_code >= 51 && current.weather_code <= 67) weatherText = "비/이슬비";
        else if (current.weather_code >= 80) weatherText = "소나기";

        // 첫 번째 시간대의 강수 확률 가져오기
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

    // [3] AI 연동 및 신체·기상 종합 러닝 점수 산출
    const aiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(aiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      사용자의 신체조건과 실시간 기상 데이터를 결합하여 오늘의 러닝 효율성 점수 및 코칭 가이드를 JSON 포맷으로 생성해주세요.

      [사용자 데이터]
      - 신장: ${height}cm, 체중: ${weight}kg (이를 통해 BMI 및 관절 과부하 가능성 분석)
      - 숙련도: ${experience}, 컨디션: ${condition}

      [기상 데이터]
      - 기온: ${realWeather.temp}, 습도: ${realWeather.humidity}, 바람: ${realWeather.wind}, 상태: ${realWeather.condition}, 강수확률: ${realWeather.rainProb}
      - 자외선, 미세먼지는 유동적으로 가정하여 종합 판단하십시오.

      [러닝 점수 산출 조건]
      - 100점 만점 기준으로 계산하되, 만약 컨디션이 'tired'이거나 강수확률이 높고 습도가 높으면 점수를 과감히 깎으세요. 신체 조건(과체중 위험도 등)에 비해 목표 강도가 적절하면 높은 점수를 부여하세요.
      - "runningScore"와 한 줄 평가인 "scoreComment"를 결과에 담아주세요.

      반드시 아래 형식의 순수 JSON으로만 출력하세요. 마크다운 블록은 금지합니다.
      {
        "runningScore": 85,
        "scoreComment": "습도가 높고 컨디션이 저하되어 있으나 보폭을 좁혀 달리면 무리 없는 최적의 신체 컨디셔닝 데이입니다.",
        "weatherExtra": { "uv": "보통", "dust": "좋음" },
        "metrics": { "time": "35:00", "distance": "3.8 km" },
        "timeline": [
          {
            "time": "00:00 - 05:00",
            "content": "신체 관절 보호를 위한 슬로우 웜업 조깅",
            "isAlert": true,
            "alertText": "현재 자외선이 강하고 비 올 확률이 ${realWeather.rainProb}이므로 땀 배출 분산 의류를 권장하며, 바람 처방으로 맞바람 시 상체를 5도 기울이세요."
          }
        ],
        "descriptionMarkdown": "<h3>🏃 신체 피드백 결과</h3><p>현재 상태 분석 내용...</p>"
      }
    `;

    const result = await model.generateContent(prompt);
    const parsedData = JSON.parse(result.response.text().trim());
    
    parsedData.routeCoordinates = actualRouteCoordinates;
    parsedData.weatherReal = realWeather;

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
