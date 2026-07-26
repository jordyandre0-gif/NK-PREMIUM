const firebaseConfig = {
  apiKey: "AIzaSyCadKqv-yZmQ6a09S2TpPCqF-ClMRE5QIQ",
  authDomain: "nk-premium.firebaseapp.com",
  projectId: "nk-premium",
  storageBucket: "nk-premium.firebasestorage.app",
  messagingSenderId: "1011946917188",
  appId: "1:1011946917188:web:ab3677dc4564ce749d9b11"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================================
// PAINEL PRIVADO — onde seus dados ficam guardados
// ============================================================
// Este é o mesmo UID de sempre — não precisa procurar de novo no Firebase.
const WORKSPACE_ID = "eW3zEtUNidPNImp0yF2rTbhQFXd2";
