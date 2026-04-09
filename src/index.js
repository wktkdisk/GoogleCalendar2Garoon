#!/usr/bin/env node
/**
 * Google Calendar → Garoon 同期スクリプト
 *
 * 実行方法:
 *   npm start
 *   node src/index.js
 */

require('dotenv').config();

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const { authorize }           = require('./auth');
const { getEventsFromGoogle } = require('./googleCalendar');
const {
  getEventsFromGaroon,
  setEventToGaroon,
  deleteEventFromGaroon,
} = require('./garoon');

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const GAROON_USER_ID     = process.env.GAROON_USER_ID;
const TIMEZONE           = process.env.TIMEZONE || 'Asia/Tokyo';

// -----------------------------------------------------------------------
// メイン処理
// -----------------------------------------------------------------------
async function main() {
  const auth = await authorize();

  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 4); // 4ヶ月後まで

  console.log('Google Calendar からイベントを取得中...');
  const googleEvents = await getEventsFromGoogle(auth, GOOGLE_CALENDAR_ID, timeMin, timeMax);
  console.log(`  → ${googleEvents.length} 件`);

  console.log('Garoon からイベントを取得中...');
  const garoonEvents = await getEventsFromGaroon(timeMin, timeMax);
  console.log(`  → ${garoonEvents.length} 件`);

  // 1. Google のイベントを基準にループ
  loopGoogle: for (const ggl of googleEvents) {
    for (const grn of garoonEvents) {
      if (grn.creator.id != GAROON_USER_ID) continue;

      const result = checkDifferences(ggl, grn);
      if (result === 'different_ids') continue;

      // ID が一致したが内容が異なる → 更新
      if (result !== 'same') {
        console.log(`更新: ${ggl.summary}`);
        await applyEventToGaroon(grn.id, ggl);
      }

      grn._checked = true;
      continue loopGoogle;
    }

    // Garoon に対応するイベントがなかった → 新規登録
    console.log(`追加: ${ggl.summary}`);
    await applyEventToGaroon(null, ggl);
  }

  // 2. Garoon 側にしかなかった（自分作成の）イベントを削除
  for (const grn of garoonEvents) {
    if (!grn._checked && grn.creator.id == GAROON_USER_ID) {
      console.log(`削除: ${grn.subject}`);
      await deleteEventFromGaroon(grn.id);
    }
  }

  console.log('\n同期が完了しました。');
}

// -----------------------------------------------------------------------
// Google イベントの内容を Garoon に登録 or 更新する
// -----------------------------------------------------------------------
async function applyEventToGaroon(garoonId, googleEvent) {
  let startDate, endDate, isAllDay;

  if (googleEvent.start.date) {
    // 終日イベント
    isAllDay  = true;
    startDate = new Date(googleEvent.start.date);
    endDate   = new Date(googleEvent.end.date);
    endDate.setDate(endDate.getDate() - 1); // Google の翌日指定 → Garoon の当日指定
  } else {
    // 時間指定イベント
    isAllDay  = false;
    startDate = new Date(googleEvent.start.dateTime);
    endDate   = new Date(googleEvent.end.dateTime);
  }

  await setEventToGaroon(garoonId, googleEvent.summary, googleEvent.htmlLink, startDate, endDate, isAllDay);
}

// -----------------------------------------------------------------------
// Google イベントと Garoon イベントの差分を確認する
//
// 戻り値:
//   'different_ids'      - htmlLink が一致しない（別イベント）
//   'same'               - 完全に一致
//   'different_subjects' - タイトルが異なる
//   'different_dates'    - 日時が異なる
// -----------------------------------------------------------------------
function checkDifferences(ggl, grn) {
  // ID 照合: Google の htmlLink を Garoon の notes に保存している
  if (ggl.htmlLink !== grn.notes) return 'different_ids';

  // タイトル比較
  if (ggl.summary !== grn.subject) return 'different_subjects';

  // 日時比較
  const grnStart = grn.start.dateTime;
  const grnEnd   = grn.end.dateTime;

  if (ggl.start.date) {
    // Google 側が終日イベント
    if (!grn.isAllDay) return 'different_dates';

    const gglStartStr = ggl.start.date;
    const grnStartStr = grnStart.split('T')[0];

    // Google の終日 end は翌日なので -1 日して比較
    const gglEndDate = dayjs(ggl.end.date).tz(TIMEZONE).subtract(1, 'day');
    const gglEndStr  = gglEndDate.format('YYYY-MM-DD');
    const grnEndStr  = grnEnd.split('T')[0];

    if (gglStartStr !== grnStartStr || gglEndStr !== grnEndStr) return 'different_dates';
  } else {
    // Google 側が時間指定イベント
    if (grn.isAllDay) return 'different_dates';
    if (ggl.start.dateTime !== grnStart || ggl.end.dateTime !== grnEnd) return 'different_dates';
  }

  return 'same';
}

// -----------------------------------------------------------------------
main().catch((err) => {
  console.error('エラーが発生しました:', err.message);
  process.exit(1);
});
