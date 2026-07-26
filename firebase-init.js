// ============================================================
// CONFIGURAÇÃO DO FIREBASE — NK PREMIUM
// ============================================================
// Onde pegar isso:
// 1. Acesse https://console.firebase.google.com
// 2. Crie um projeto (ex: "nk-premium-erp")
// 3. Vá em ⚙ Configurações do projeto > Geral > "Seus apps" > Web (</>)
// 4. Copie o objeto firebaseConfig gerado e cole abaixo, substituindo o exemplo.
// 5. Ative no console: Authentication > Sign-in method > Email/senha
// 6. Ative no console: Firestore Database > Criar banco de dados
//
// NÃO precisa mexer em mais nada neste arquivo além do objeto abaixo.
// ============================================================

const firebaseConfig = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
