
// settings
const g_googleCalendarId = "your-name@gmail.com";
const g_garoonApi = "https://gr.tsukuba-tech.ac.jp/scripts/cbgrn/grn.exe/api/v1/schedule/events";
const g_garoonAuth = "GaroonのパスワードのMD5"; 
const g_garoonUserId = "33";
const g_basicAuth = "不要";

const TIMEZONE = Session.getScriptTimeZone();

function myFunction() {
  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setMonth(timeMin.getMonth() + 4); // 4ヶ月後まで

  // 1. 各カレンダーからイベント取得
  const googleEvents = getEventsFromGoogle(timeMin, timeMax, 1000);
  const garoonEvents = getEventsFromGaroon(timeMin, timeMax, 1000);

  // 2. Googleの予定を基準にループ
  loopGoogle: for (const ggl_event of googleEvents) {
    
    for (const grn_event of garoonEvents) {
      // Garoonで自分が作成したイベント以外はスキップ
      if (grn_event.creator.id != g_garoonUserId) continue;

      const chkRes = checkDifferences(ggl_event, grn_event);

      if (chkRes === "different_ids") continue;

      // IDが一致した場合の処理
      if (chkRes !== "same") {
        console.log(`Update: ${ggl_event.summary}`);
        setEventFromGoogleToGaroon(grn_event.id, ggl_event);
      }
      
      grn_event.checked = true; // 処理済みフラグ
      continue loopGoogle;
    }

    // Garoon側に一致するイベントがなかった場合は新規登録
    console.log(`Add: ${ggl_event.summary}`);
    setEventFromGoogleToGaroon(null, ggl_event);
  }

  // 3. Google側に存在しなかった（かつ自分が作成した）Garoon予定を削除
  for (const grn_event of garoonEvents) {
    if (!grn_event.checked && grn_event.creator.id == g_garoonUserId) {
      console.log(`Delete: ${grn_event.subject}`);
      deleteEventFromGaroon(grn_event.id);
    }
  }
}

function getEventsFromGoogle(timeMin, timeMax, maxResults) {
  const params = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: maxResults,
    singleEvents: true
  };
  const response = Calendar.Events.list(g_googleCalendarId, params);
  return response.items || [];
}

function getEventsFromGaroon(timeMin, timeMax, maxResults) {
  const format = "yyyy-MM-dd'T'HH:mm:ssXXX";
  const startStr = Utilities.formatDate(timeMin, TIMEZONE, format);
  const endStr = Utilities.formatDate(timeMax, TIMEZONE, format);

  const query = `?orderBy=${encodeURIComponent("start asc")}&limit=${maxResults}&rangeStart=${encodeURIComponent(startStr)}&rangeEnd=${encodeURIComponent(endStr)}`;

  const options = {
    method: "GET",
    headers: {
      "Authorization": " Basic " + g_basicAuth,
      "X-Cybozu-Authorization": g_garoonAuth
    }
  };

  const response = UrlFetchApp.fetch(g_garoonApi + query, options);
  const data = JSON.parse(response.getContentText());
  
  return (data.events || []).filter(item => item.creator.id == g_garoonUserId);
}

function checkDifferences(googleEvent, garoonEvent) {
  // ID比較 (GoogleのhtmlLinkをGaroonのnotesに保存している想定)
  if (googleEvent.htmlLink !== garoonEvent.notes) return "different_ids";

  // タイトル比較
  if (googleEvent.summary !== garoonEvent.subject) return "different_subjects";

  // 日時比較
  const grn_start = garoonEvent.start.dateTime;
  const grn_end = garoonEvent.end.dateTime;

  if (googleEvent.start.date) { // Google側が終日
    if (!garoonEvent.isAllDay) return "different_dates";
    
    const gglStart = googleEvent.start.date;
    const grnStart = grn_start.split("T")[0];
    
    // Googleの終日endは翌日なので、比較用に-1日する
    const gglEndDate = new Date(googleEvent.end.date);
    gglEndDate.setDate(gglEndDate.getDate() - 1);
    const gglEndStr = Utilities.formatDate(gglEndDate, TIMEZONE, "yyyy-MM-dd");
    const grnEndStr = grn_end.split("T")[0];

    if (gglStart !== grnStart || gglEndStr !== grnEndStr) return "different_dates";
  } else { // Google側が時間指定
    if (garoonEvent.isAllDay) return "different_dates";
    
    // 秒数の表記揺れ等を考慮しつつ比較
    if (googleEvent.start.dateTime !== grn_start || googleEvent.end.dateTime !== grn_end) {
      return "different_dates";
    }
  }
  return "same";
}

function setEventFromGoogleToGaroon(garoonScheduleId, googleEvent) {
  let startDate, endDate, isAllDay;

  if (googleEvent.start.date) { // 終日
    isAllDay = true;
    startDate = new Date(googleEvent.start.date);
    endDate = new Date(googleEvent.end.date);
    endDate.setDate(endDate.getDate() - 1); // Googleの翌日指定をGaroonの当日指定に直す
  } else { // 時間指定
    isAllDay = false;
    startDate = new Date(googleEvent.start.dateTime);
    endDate = new Date(googleEvent.end.dateTime);
  }

  setEventToGaroon(garoonScheduleId, googleEvent.summary, googleEvent.htmlLink, startDate, endDate, isAllDay);
}

function setEventToGaroon(scheduleId, subject, notes, startDate, endDate, isAllDay) {
  const format = "yyyy-MM-dd'T'HH:mm:ssXXX";
  const startDateTime = Utilities.formatDate(startDate, TIMEZONE, format);
  const endDateTime = Utilities.formatDate(endDate, TIMEZONE, format);

  const bodyObj = {
    "subject": subject,
    "eventType": "REGULAR",
    "visibilityType": "PUBLIC",
    "start": { "dateTime": startDateTime, "timeZone": TIMEZONE },
    "end": { "dateTime": endDateTime, "timeZone": TIMEZONE },
    "isAllDay": isAllDay,
    "notes": notes,
    "attendees": [{ "id": g_garoonUserId, "type": "USER" }]
  };

  const options = {
    method: scheduleId ? "patch" : "post",
    muteHttpExceptions: true,
    headers: {
      "Authorization": " Basic " + g_basicAuth,
      "X-Cybozu-Authorization": g_garoonAuth,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(bodyObj)
  };

  const url = scheduleId ? `${g_garoonApi}/${scheduleId}` : g_garoonApi;
  UrlFetchApp.fetch(url, options);
}

function deleteEventFromGaroon(scheduleId) {
  const options = {
    method: "delete",
    muteHttpExceptions: true,
    headers: {
      "Authorization": " Basic " + g_basicAuth,
      "X-Cybozu-Authorization": g_garoonAuth
    }
  };
  UrlFetchApp.fetch(`${g_garoonApi}/${scheduleId}`, options);
}