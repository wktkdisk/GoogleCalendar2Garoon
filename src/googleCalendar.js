const { google } = require('googleapis');

/**
 * Google Calendar からイベント一覧を取得する
 * @param {OAuth2Client} auth  - 認証済みクライアント
 * @param {string}       calendarId
 * @param {Date}         timeMin
 * @param {Date}         timeMax
 * @param {number}       maxResults
 * @returns {Array}  イベントの配列
 */
async function getEventsFromGoogle(auth, calendarId, timeMin, timeMax, maxResults = 1000) {
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
  });
  return response.data.items || [];
}

module.exports = { getEventsFromGoogle };
