import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    const { sleep, rhr, workload, fatigue, currentHr, speed, duration } = req.body;
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      사용자의 현재 러닝 및 헬스케어 디바이스 데이터입니다:
      - 수면 시간: ${sleep}시간
      - 안정 시 심박수 (RHR): ${rhr} bpm
      - 최근 운동량: ${workload}
      - 주관적 피로도: ${fatigue} / 10
      - 현재 심박수: ${currentHr} bpm
      - 현재 속도: ${speed} km/h
      - 현재 운동 시간: ${duration}분

      이 데이터를 기반으로 러닝 안전 진단을 내려주세요. 
      출력은 반드시 타임테이블(시간대별 페이스 및 행동 요령 안내) 배열과 상세 종합 피드백 텍스트를 포함해야 합니다.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            timetable: {
              type: "ARRAY",
              description: "향후 러닝 시간대별 권장 행동 지침 리스트",
              items: {
                type: "OBJECT",
                properties: {
                  time: { type: "STRING", description: "예: '0~10분', '10~20분' 등" },
                  action: { type: "STRING", description: "해당 시간대에 유지할 페이스 및 주의사항" }
                },
                required: ["time", "action"]
              }
            },
            feedback: { 
              type: "STRING", 
              description: "현재 생체 데이터를 분석한 종합 안전 피드백 텍스트" 
            }
          },
          required: ["timetable", "feedback"]
        }
      }
    });

    const resultText = response.text;
    return res.status(200).json(JSON.parse(resultText));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Gemini API 호출 중 오류가 발생했습니다.', details: error.message });
  }
}
