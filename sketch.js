// 台北市政府水利局 (WIC) API 網址
const WIC_API_URL = 'https://wic.gov.taipei/OpenData/API/Rain/Get?stationNo=&loginId=open_rain&dataKey=85452C1D';

// 預設行政區座標，確保地圖顯示穩定
const TAIPEI_DISTRICTS_BASE = [
  { name: "北投區", lat: 25.132, lng: 121.498, rain: 0, stations: [] },
  { name: "士林區", lat: 25.101, lng: 121.551, rain: 0, stations: [] },
  { name: "內湖區", lat: 25.075, lng: 121.589, rain: 0, stations: [] },
  { name: "中山區", lat: 25.068, lng: 121.533, rain: 0, stations: [] },
  { name: "大同區", lat: 25.063, lng: 121.513, rain: 0, stations: [] },
  { name: "松山區", lat: 25.059, lng: 121.558, rain: 0, stations: [] },
  { name: "萬華區", lat: 25.035, lng: 121.499, rain: 0, stations: [] },
  { name: "中正區", lat: 25.032, lng: 121.518, rain: 0, stations: [] },
  { name: "大安區", lat: 25.026, lng: 121.543, rain: 0, stations: [] },
  { name: "信義區", lat: 25.033, lng: 121.567, rain: 0, stations: [] },
  { name: "南港區", lat: 25.052, lng: 121.607, rain: 0, stations: [] },
  { name: "文山區", lat: 24.989, lng: 121.554, rain: 0, stations: [] }
];

let districts = JSON.parse(JSON.stringify(TAIPEI_DISTRICTS_BASE));
let raindrops = [];
let currentDistrict = null;
let lastDataTime = "尚未更新"; // 儲存資料來源時間
let cityAverageRain = 0;      // 儲存全市平均雨量
let myMap;
let canvas;
const mappa = new Mappa('Leaflet');

const options = {
  lat: 25.0478,
  lng: 121.5319,
  zoom: 12,
  style: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
};

function setup() {
  // 建立與視窗同寬高的畫布
  canvas = createCanvas(windowWidth, windowHeight);

  // 初始化雨滴
  for (let i = 0; i < 1000; i++) {
    raindrops.push(new Raindrop());
  }

  // 建立地圖層
  myMap = mappa.tileMap(options);
  myMap.overlay(canvas); // Mappa 會自動處理畫布的 parent 與位置

  // 模擬從動態 API 取得資料
  fetchRainData();

  // 每 5 分鐘抓取一次真實資料
  setInterval(fetchRainData, 300000);
}

function fetchRainData() {
  console.log("正在嘗試連線至台北市水利局 API...");
  // 使用 corsproxy.io 並加上 timestamp 避免快取
  const proxy_url = `https://corsproxy.io/?${encodeURIComponent(WIC_API_URL)}&ts=${Date.now()}`;

  loadJSON(proxy_url, (response) => {
    const stationArray = response && response.data ? response.data : null;
    if (!Array.isArray(stationArray) || stationArray.length === 0) {
      console.error("API 回傳格式錯誤或無資料:", response);
      return;
    }

    // 取得資料來源時間 (格式 YYYYMMDDHHmm -> HH:mm)
    const firstRec = stationArray[0].recTime;
    if (firstRec) {
      lastDataTime = `${firstRec.substring(8, 10)}:${firstRec.substring(10, 12)}`;
    }

    // 2. 初始化行政區容器
    let grouped = {};
    TAIPEI_DISTRICTS_BASE.forEach(d => {
      grouped[d.name] = { ...d, rainTotal: 0, sCount: 0, stations: [] };
    });
    let totalRain = 0;
    let validStations = 0;

    // 3. 將 WIC 測站資料歸類到對應的行政區
    stationArray.forEach(item => {
      // 確保有站名且雨量欄位正確 (API 欄位為 'rain')
      if (!item.stationName) return;
      
      let rainValue = parseFloat(item.rain); 
      if (isNaN(rainValue) || rainValue < 0) rainValue = 0;
      totalRain += rainValue;
      validStations++;

      // 匹配邏輯：優先使用 townName，若無則從 stationName 判斷區域
      let rawLocation = (item.townName || item.stationName).replace(/台/g, '臺');

      // 比對地圖上的行政區 (只要字串包含區域名稱，例如「北投」)
      let matchKey = Object.keys(grouped).find(k => 
        rawLocation.includes(k.replace('區', ''))
      );

      if (matchKey) {
        grouped[matchKey].rainTotal += rainValue;
        grouped[matchKey].sCount++;
        grouped[matchKey].stations.push(`${item.stationName.trim()}: ${rainValue.toFixed(1)}mm`);
      }
    });

    // 計算全市平均雨量
    cityAverageRain = validStations > 0 ? totalRain / validStations : 0;

    // 4. 計算平均並更新至全域變數
    districts = Object.values(grouped).map(d => {
      d.rain = d.sCount > 0 ? d.rainTotal / d.sCount : 0;
      return d;
    });

    console.log("%c 台北市資料更新成功: " + new Date().toLocaleTimeString(), "color: #1EA046; font-weight: bold;");
  }, (err) => {
    console.error("連線失敗，請檢查網路或代理伺服器狀態:", err);
  });
}

function draw() {
  clear(); // 清除畫布讓底層地圖顯現

  let displayRain = currentDistrict ? currentDistrict.rain : cityAverageRain;

  // 動態背景顏色 (根據雨量漸進式變暗，增加雨滴對比度)
  if (displayRain > 0) {
    let bgAlpha = map(displayRain, 0, 50, 40, 200);
    fill(0, 0, 0, bgAlpha);
    noStroke();
    rect(0, 0, width, height);
  }

  displayWeatherEffect();
  displayDistricts();
  displayDashboard();
}

// 雨滴類別
class Raindrop {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = random(width);
    this.y = random(-500, -50);
    this.z = random(0, 20);
    this.len = map(this.z, 0, 20, 10, 20);
    this.yspeed = map(this.z, 0, 20, 4, 10);
  }

  fall(rainIntensity) {
    this.y += this.yspeed * (rainIntensity + 0.5); // 確保微量雨時也有下落感
    if (this.y > height) {
      this.reset();
    }
  }

  show() {
    stroke(255, 255, 255, 200); // 增加亮度
    strokeWeight(map(this.z, 0, 20, 1, 3));
    line(this.x, this.y, this.x, this.y + this.len);
  }
}

function displayWeatherEffect() {
  if (currentDistrict) {
    if (currentDistrict.rain > 0) {
      // 根據雨量決定雨滴密度與速度
      let intensity = map(currentDistrict.rain, 0, 100, 0.5, 5);
      // 確保 count 不會超過 raindrops 陣列長度，避免 undefined 錯誤
      let count = floor(map(currentDistrict.rain, 0, 100, 150, raindrops.length));
      count = constrain(count, 0, raindrops.length - 1);

      for (let i = 0; i < count; i++) {
        if (raindrops[i]) {
          raindrops[i].fall(intensity);
          raindrops[i].show();
        }
      }
    } else {
      // 天晴：繪製太陽
      noStroke();
      fill(255, 200, 0, 200);
      ellipse(width - 100, 100, 80, 80);
      // 太陽光暈
      fill(255, 255, 0, 50);
      ellipse(width - 100, 100, 120 + sin(frameCount * 0.05) * 10, 120 + sin(frameCount * 0.05) * 10);
    }
  }
}

function displayDistricts() {
  currentDistrict = null;
  
  for (let d of districts) {
    let pos = myMap.latLngToPixel(d.lat, d.lng);
    let dSize = 40;
    let distance = dist(mouseX, mouseY, pos.x, pos.y);
    let scaleEffect = 1.0;
    
    // 根據雨量設定地點顏色
    let rainCol, textCol;
    if (d.rain === 0) {
      rainCol = color(50, 205, 50, 200); // 綠色 - 天晴
      textCol = color(0);
    } else if (d.rain <= 5) {
      rainCol = color(255, 255, 0, 200); // 黃色 - 小雨
      textCol = color(0);
    } else if (d.rain <= 15) {
      rainCol = color(255, 165, 0, 200); // 橘色 - 中雨
      textCol = color(255);
    } else {
      rainCol = color(255, 0, 0, 200);   // 紅色 - 大雨
      textCol = color(255);
    }

    // 偵測滑鼠是否在區域上
    if (distance < dSize / 2) {
      currentDistrict = d;
      fill(255, 255, 255); // 移入時高亮為白色
      textCol = color(0);
      scaleEffect = 1.3;
    } else {
      fill(rainCol);
      scaleEffect = 1.0;
    }
    
    stroke(255); // 白色邊框
    strokeWeight(2);
    ellipse(pos.x, pos.y, dSize * scaleEffect);
    
    // 顯示區名
    push();
    textAlign(CENTER, CENTER);
    textSize(12);
    noStroke();
    fill(0, 180); // 繪製文字陰影背景
    text(d.name, pos.x + 1, pos.y + 1);
    fill(textCol); 
    text(d.name, pos.x, pos.y);
    pop();
  }
}

function displayDashboard() {
  // 左上角資訊看板
  push();
  textAlign(LEFT, TOP);
  fill(0, 0, 0, 180);
  noStroke();
  
  let nowStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  let dataTimeLabel = `資料時間: ${lastDataTime}`;

  // --- 1. 動態計算看板寬度與高度 ---
  textSize(20); textStyle(BOLD);
  let maxWidth = textWidth("台北市即時雨量監測");
  
  textSize(14); textStyle(NORMAL);
  maxWidth = max(maxWidth, textWidth(nowStr), textWidth(dataTimeLabel));

  let h = 0;
  
  if (currentDistrict) {
    textSize(16); textStyle(NORMAL);
    maxWidth = max(maxWidth, textWidth(`區域: ${currentDistrict.name} `), textWidth(`平均雨量: ${currentDistrict.rain.toFixed(1)} mm`));
    
    textSize(14);
    for (let s of currentDistrict.stations) {
      maxWidth = max(maxWidth, textWidth(`• ${s} `) + 20);
    }
    h = 200 + (currentDistrict.stations.length * 22);
  } else {
    textSize(13);
    for (let d of districts) {
      maxWidth = max(maxWidth, textWidth(`${d.name}: ${d.rain.toFixed(1)} mm`) + 30);
    }
    h = 150 + (districts.length * 18);
  }
  
  let rectW = maxWidth + 60; 
  rect(20, 20, rectW, h, 10);
  
  // --- 2. 繪製文字 ---
  fill(255);
  textSize(20);
  textStyle(BOLD);
  text("台北市即時雨量監測", 35, 35);
  
  // 繪製即時時間
  fill(200);
  textSize(14);
  textStyle(NORMAL);
  text(nowStr, 35, 60);
  
  // 繪製資料來源時間
  fill(30, 200, 255);
  text(dataTimeLabel, 35, 78);

  textSize(16);
  textStyle(NORMAL);
  if (currentDistrict) {
    fill(255, 204, 0);
    text(`區域: ${currentDistrict.name}`, 35, 105);
    fill(255);
    text(`平均雨量: ${currentDistrict.rain.toFixed(1)} mm`, 35, 125);
    
    textSize(14);
    fill(200);
    text("詳細地點觀測值:", 35, 155);
    for(let i = 0; i < currentDistrict.stations.length; i++) {
      fill(255);
      text(`• ${currentDistrict.stations[i]}`, 45, 180 + (i * 22));
    }
  } else {
    fill(255, 204, 0);
    text("全市各區雨量概況:", 35, 105);
    textSize(13);
    for (let i = 0; i < districts.length; i++) {
      let d = districts[i];
      if (d.rain === 0) fill(150, 255, 150);
      else if (d.rain <= 5) fill(255, 255, 150);
      else fill(255, 150, 150);
      text(`${d.name}: ${d.rain.toFixed(1)} mm`, 40, 130 + (i * 18));
    }
  }
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (myMap && myMap.map) {
    myMap.map.invalidateSize(); // 通知 Leaflet 地圖更新尺寸，防止黑屏
  }
}
