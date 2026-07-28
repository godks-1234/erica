<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
    let userLocation = { lat: 37.5665, lon: 126.9780 }; 
    let map = null;
    let routeLayer = null;
    let startMarker = null;
    let watchId = null; // 💡 실시간 추적 ID 저장 변수

    window.addEventListener('DOMContentLoaded', () => {
        // 스플래시 화면 제어
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            const mainApp = document.getElementById('main-app');
            splash.style.opacity = '0';
            mainApp.style.display = 'flex';
            setTimeout(() => {
                splash.style.display = 'none';
                mainApp.style.opacity = '1';
            }, 800);
        }, 2500);

        // 💡 [실시간 위치 추적 도입]: 사용자가 이동할 때마다 감지
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const newLat = Number(position.coords.latitude);
                    const newLon = Number(position.coords.longitude);
                    
                    // 위치 변화가 유의미할 때 데이터 갱신 (오차 범위 방지)
                    const isMoved = Math.abs(userLocation.lat - newLat) > 0.0001 || Math.abs(userLocation.lon - newLon) > 0.0001;
                    
                    userLocation.lat = newLat;
                    userLocation.lon = newLon;
                    
                    document.getElementById('location-status').innerText = `📡 실시간 위치 추적 중 (${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)})`;
                    document.getElementById('location-status').style.backgroundColor = '#e3fbe3';
                    document.getElementById('location-status').style.color = '#1b5e20';

                    // 1. 지도가 이미 로드되어 있다면 마커 위치를 실시간 갱신
                    if (map && startMarker) {
                        startMarker.setLatLng([userLocation.lat, userLocation.lon]);
                    }

                    // 2. 만약 이미 분석 결과 창이 띄워져 있는 상태에서 사용자가 크게 이동했다면 자동으로 경로 재계산
                    if (document.getElementById('result-section').style.display === 'grid' && isMoved) {
                        console.log("위치 변경 감지: 경로를 실시간 재동기화합니다.");
                        triggerAnalysis(true); // 조용한 갱신 실행
                    }
                },
                (error) => {
                    document.getElementById('location-status').innerText = `⚠️ 실시간 위치 권한 오류 (기본위치 작동)`;
                    document.getElementById('location-status').style.backgroundColor = '#ffebe9';
                    document.getElementById('location-status').style.color = '#ff3b30';
                },
                { 
                    enableHighAccuracy: true, // GPS 센서 정밀도 최대로 상향
                    timeout: 10000, 
                    maximumAge: 0 // 캐시된 위치를 쓰지 않고 항상 새 위치 요청
                }
            );
        }
    });

    // 분석 실행 공통 함수 (isSilent: 실시간 갱신 시 로딩 스피너로 화면을 가리지 않음)
    async function triggerAnalysis(isSilent = false) {
        const height = document.getElementById('height').value;
        const weight = document.getElementById('weight').value;
        const experience = document.getElementById('experience').value;
        const condition = document.getElementById('condition').value;
        
        const loader = document.getElementById('loader');
        const resultSection = document.getElementById('result-section');
        const weatherWidget = document.getElementById('weather-widget');
        const scoreBlock = document.getElementById('score-block');
        
        if (!isSilent) {
            loader.style.display = 'block';
            resultSection.style.display = 'none';
        }

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    height: Number(height),
                    weight: Number(weight),
                    experience,
                    condition,
                    location: userLocation
                })
            });

            const data = await response.json();
            if (data.error) return;

            // 실시간 날씨 및 강수 확률 갱신
            document.getElementById('w-temp').innerText = data.weatherReal.temp;
            document.getElementById('w-status').innerText = data.weatherReal.condition;
            document.getElementById('w-humidity').innerText = data.weatherReal.humidity;
            document.getElementById('w-wind').innerText = data.weatherReal.wind;
            document.getElementById('w-rain').innerText = data.weatherReal.rainProb;
            document.getElementById('w-uv').innerText = data.weatherExtra.uv;
            document.getElementById('w-dust').innerText = data.weatherExtra.dust;
            document.getElementById('w-addr').innerText = `실시간 동기화 완료`;
            
            const cond = data.weatherReal.condition;
            let icon = "🌙";
            if(cond.includes("맑음")) icon = "☀️";
            else if(cond.includes("구름")) icon = "⛅";
            else if(cond.includes("비")) icon = "🌧️";
            document.getElementById('w-icon').innerText = icon;
            weatherWidget.style.display = 'block';

            // 실시간 점수 갱신
            document.getElementById('lbl-score').innerText = data.runningScore || "80";
            document.getElementById('lbl-comment').innerText = data.scoreComment || "";
            scoreBlock.style.display = 'flex';

            document.getElementById('running-time').innerText = data.metrics.time;
            document.getElementById('running-distance').innerText = data.metrics.distance;

            // 타임라인 생성
            const timelineContainer = document.getElementById('timeline-container');
            timelineContainer.innerHTML = '';
            data.timeline.forEach(item => {
                const div = document.createElement('div');
                div.className = `timeline-item ${item.isAlert ? 'alert' : ''}`;
                let alertHtml = item.isAlert ? `<div class="timeline-alert-text">⚠️ ${item.alertText}</div>` : '';
                div.innerHTML = `
                    <div class="timeline-time">${item.time}</div>
                    <div class="timeline-content">${item.content}</div>
                    ${alertHtml}
                `;
                timelineContainer.appendChild(div);
            });

            document.getElementById('description-container').innerHTML = data.descriptionMarkdown;
            
            loader.style.display = 'none';
            resultSection.style.display = 'grid';

            // 지도 레이어 동기화 처리
            setTimeout(() => {
                if (!map) {
                    map = L.map('map').setView([userLocation.lat, userLocation.lon], 15);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '© OpenStreetMap'
                    }).addTo(map);
                }

                if (!startMarker) {
                    startMarker = L.marker([userLocation.lat, userLocation.lon])
                        .addTo(map)
                        .bindPopup('<b>🏃 실시간 내 위치</b>')
                        .openPopup();
                } else {
                    startMarker.setLatLng([userLocation.lat, userLocation.lon]);
                }

                if (data.routeCoordinates && data.routeCoordinates.length > 0) {
                    if (routeLayer) map.removeLayer(routeLayer);
                    routeLayer = L.polyline(data.routeCoordinates, {
                        color: '#4364F7',
                        weight: 5,
                        opacity: 0.9,
                        dashArray: '2, 8'
                    }).addTo(map);

                    // 최초 1회 혹은 큰 이동 시에만 카메라 포커스 맞춤
                    if(!isSilent) {
                        map.fitBounds(routeLayer.getBounds());
                    }
                }
            }, 200);

        } catch (err) {
            console.error("실시간 스트리밍 동기화 실패:", err);
            loader.style.display = 'none';
        }
    }

    // 수동 분석하기 버튼 클릭 시 이벤트 트리거
    document.getElementById('btn-analyze').addEventListener('click', () => triggerAnalysis(false));
</script>
