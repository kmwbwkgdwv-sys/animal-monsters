// =============================================================
//  Firebase の設定（プロジェクト：animal-monsters）
//  Firebaseコンソール →（歯車）プロジェクトの設定 → マイアプリ（ウェブ）の値です。
//  オンライン機能（フレンド・トレード・対戦・引き継ぎ・ランキング）は
//  Realtime Database（シンガポール：asia-southeast1）を使います。
// =============================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyAlcoqLJZokY6CDbARtwFbzG7-_BUTVBCQ',
  authDomain: 'animal-monsters.firebaseapp.com',
  databaseURL: 'https://animal-monsters-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'animal-monsters',
  storageBucket: 'animal-monsters.firebasestorage.app',
  messagingSenderId: '756002084669',
  appId: '1:756002084669:web:d62e294998960f12d55754',
};

// Firebase JS SDK のバージョン（CDNから読み込みます）
export const FIREBASE_SDK_VERSION = '10.12.2';

export function firebaseReady() {
  const c = firebaseConfig;
  return !!c.apiKey && !!c.projectId && !!c.databaseURL && !/YOUR_/.test(c.projectId + c.appId + c.databaseURL);
}
