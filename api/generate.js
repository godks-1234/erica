<!-- Firebase v10 모듈러 SDK 로드 (기존 디자인 레이아웃에 전혀 영향을 주지 않습니다) -->
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy, 
    serverTimestamp 
  } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  // ③ 제공해주신 erica-ac4d1 프로젝트 설정값 적용 완료
  const firebaseConfig = {
    apiKey: "AIzaSyCC81Sd9qJjana1VK1qPg99mTijSp5_3ZQ",
    authDomain: "erica-ac4d1.firebaseapp.com",
    projectId: "erica-ac4d1",
    storageBucket: "erica-ac4d1.firebasestorage.app",
    messagingSenderId: "186480549738",
    appId: "1:186480549738:web:f925a9910e9e23c7dc8f13"
  };

  // Firebase 및 Firestore 초기화 (④ 서비스 계정 키 미사용 보안 표준 준수)
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // 💡 [기존 UI 연결 설정] 실제 HTML 내부 태그의 id 값에 맞게 수정해 주세요.
  const boardInput = document.getElementById('board-input');         // 글 입력 텍스트박스
  const submitBtn = document.getElementById('btn-board-submit');     // 등록 버튼
  const boardListContainer = document.getElementById('board-list-container'); // 게시판 목록 영역

  /**
   * ②, ⑤ 앱 실행 시 Firestore에서 글을 '최신순'으로 불러와 목록에 표시하는 함수
   */
  async function loadPosts() {
    if (!boardListContainer) return;

    try {
      // 'posts' 컬렉션에서 'createdAt' 필드 기준 최신순(내림차순) 정렬 쿼리 정의
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);

      // 기존 디자인 폼을 유지한 상태에서 목록 내부 요소들만 비우기
      boardListContainer.innerHTML = "";

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // 🎨 [기존 디자인 완전 보존]
        // 기존에 목록에 들어가던 HTML 태그 구조와 CSS 클래스명을 그대로 활용합니다.
        const postElement = document.createElement('div');
        postElement.className = 'existing-post-item-class'; // 💡 기존 게시글 CSS 클래스명 적기
        
        postElement.innerHTML = `
          <div class="post-content">${escapeHtml(data.content)}</div>
          <div class="post-date" style="font-size: 0.8rem; opacity: 0.5; margin-top: 5px;">
            ${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString('ko-KR') : '방금 전'}
          </div>
        `;
        
        boardListContainer.appendChild(postElement);
      });
    } catch (error) {
      console.error("게시판 목록 로드 실패:", error);
    }
  }

  /**
   * ① 입력창에 글을 쓰고 등록 버튼을 누르면 Firestore에 저장하는 이벤트
   */
  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const contentText = boardInput.value.trim();
      if (!contentText) {
        alert("내용을 입력해 주세요.");
        return;
      }

      try {
        submitBtn.disabled = true; // 서버 통신 중 중복 등록 방지

        // 'posts' 컬렉션에 새 글 저장 (서버 측 타임스탬프 기록)
        await addDoc(collection(db, "posts"), {
          content: contentText,
          createdAt: serverTimestamp() 
        });

        boardInput.value = ""; // 글 작성 칸 비우기
        await loadPosts();    // ⑤ 최신순으로 갱신된 리스트 다시 뿌려주기
      } catch (error) {
        console.error("Firestore 글 등록 실패:", error);
        alert("글 등록 중 통신 오류가 발생했습니다.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // 앱 화면이 열리면 자동으로 Firestore 데이터 로드 실행
  window.addEventListener('DOMContentLoaded', loadPosts);

  // 크로스사이트 스크립팅(XSS) 방지를 위한 보안 안전 함수
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
</script>
