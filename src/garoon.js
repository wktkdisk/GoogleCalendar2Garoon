/**
 * Garoon REST API モジュール
 *
 * 認証: X-Cybozu-Authorization ヘッダー (Base64エンコードの loginName:password)
 * ローカル実行のため Basic 認証は使用しない
 */

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const GAROON_API     = process.env.GAROON_API;
const GAROON_USER_ID = process.env.GAROON_USER_ID;
const TIMEZONE       = process.env.TIMEZONE || 'Asia/Tokyo';

/** Garoon API 共通ヘッダーを生成する */
function buildHeaders(withContentType = false) {
  const auth = Buffer.from(
    `${process.env.GAROON_USERNAME}:${process.env.GAROON_PASSWORD}`
  ).toString('base64');

  const headers = { 'X-Cybozu-Authorization': auth };
  if (withContentType) headers['Content-Type'] = 'application/json';
  return headers;
}

/** Date を Garoon API が受け付ける RFC3339 形式にフォーマットする */
function formatDate(date) {
  return dayjs(date).tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ssZ');
}

/**
 * Garoon からイベント一覧を取得する（自分が作成したものだけ返す）
 */
async function getEventsFromGaroon(timeMin, timeMax, maxResults = 1000) {
  const startStr = encodeURIComponent(formatDate(timeMin));
  const endStr   = encodeURIComponent(formatDate(timeMax));
  const orderBy  = encodeURIComponent('start asc');
  const query    = `?orderBy=${orderBy}&limit=${maxResults}&rangeStart=${startStr}&rangeEnd=${endStr}`;

  const response = await fetch(GAROON_API + query, {
    method: 'GET',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Garoon GET failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return (data.events || []).filter(e => e.creator.id == GAROON_USER_ID);
}

/**
 * Garoon にイベントを新規登録 or 更新する
 * @param {string|null} scheduleId - null のとき新規登録、ID指定で更新 (PATCH)
 */
async function setEventToGaroon(scheduleId, subject, notes, startDate, endDate, isAllDay) {
  const body = {
    subject,
    eventType: 'REGULAR',
    visibilityType: 'PUBLIC',
    start: { dateTime: formatDate(startDate), timeZone: TIMEZONE },
    end:   { dateTime: formatDate(endDate),   timeZone: TIMEZONE },
    isAllDay,
    notes,
    attendees: [{ id: GAROON_USER_ID, type: 'USER' }],
  };

  const url    = scheduleId ? `${GAROON_API}/${scheduleId}` : GAROON_API;
  const method = scheduleId ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method,
    headers: buildHeaders(true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Garoon ${method} failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Garoon のイベントを削除する
 */
async function deleteEventFromGaroon(scheduleId) {
  const response = await fetch(`${GAROON_API}/${scheduleId}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Garoon DELETE failed: ${response.status} ${await response.text()}`);
  }
}

module.exports = { getEventsFromGaroon, setEventToGaroon, deleteEventFromGaroon };
