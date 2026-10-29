// =============================================================
//  Firebase の設定
//  Firebaseコンソール →（歯車）プロジェクトの設定 → マイアプリ（ウェブ）
//  に表示される firebaseConfig の値をここに貼り付けてください。
//  ※ apiKey はいただいたものを入れてあります。
//    projectId などの残りの値を入れると、フレンド・トレード・対戦・引き継ぎが使えます。
// =============================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyAlcoqLJZokY6CDbARtwFbzG7-_BUTVBCQ',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Firebase JS SDK のバージョン（CDNから読み込みます）
export const FIREBASE_SDK_VERSION = '10.12.2';

export function firebaseReady() {
  return !!firebaseConfig.apiKey && !!firebaseConfig.projectId && !/YOUR_/.test(firebaseConfig.projectId + firebaseConfig.appId);
}
