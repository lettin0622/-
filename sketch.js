// --- 遊戲狀態變數 ---
let gameState = 'START'; 
let totalQuestions = 0; 
let currentQuestionIndex = 0; 

// --- 錯題追蹤與狀態 ---
let incorrectlyShotWords = []; 
let currentQuestionMaxShots = 0;
let currentQuestionCorrectShots = 0; 
let errorTimer = 0; 

// --- 遊戲設定 ---
let player; 
let bullets = []; 
let questions = []; 
let currentQuestion; 
let macaronPink = '#FADDE1'; 
let airplaneImg; 
let gameTable; 
let backgroundProps = []; 

// --- SCORM 相關變數 ---
let SCORM_INITIALIZED = false;
let totalCorrectShots = 0; // 追蹤總共正確射擊的干擾項數量
let totalPossibleShots = 0; // 追蹤總共應射擊的干擾項數量

// --- 固定畫布尺寸 (900px) ---
const CANVAS_W = 900; 
const CANVAS_H = 550;

// --- 尺寸設定 ---
const PLAYER_W = 100; 
const PLAYER_H = 65;
const BULLET_R = 12; 
const OPTION_W = 150; 
const OPTION_H = 60;
const FONT_SIZE_OPTION = 24;
const PLAYER_SPEED = 18; 
const BUTTON_W = 200;
const BUTTON_H = 50;


// --- 預載入函式 (p5.js 專用) ---
function preload() {
    airplaneImg = loadImage('airplane.png', 
        () => console.log("Airplane loaded."),
        (err) => console.error("Error loading airplane.png. Check file path.", err)
    );
    
    gameTable = loadTable('questions.csv', 'csv', 'header', 
        () => console.log("CSV loaded."),
        (err) => console.error("Error loading questions.csv. Check file path and content format.", err)
    );
}

// --- SCORM 函式 ---

/**
 * 處理 SCORM 初始化並設定狀態顯示
 */
function scormInitialize() {
    // 檢查 API Wrapper 是否已載入並初始化
    if (typeof doLMSInitialize === 'function') {
        let result = doLMSInitialize();
        if (result === 'true' || result === true) {
            SCORM_INITIALIZED = true;
            document.getElementById('scorm-status').innerText = 'SCORM 狀態: 已連線';
            // 課程開始時設定狀態為 Incomplete 或 Not Attempted
            doLMSSetValue('cmi.completion_status', 'incomplete');
            doLMSCommit();
        } else {
            document.getElementById('scorm-status').innerText = 'SCORM 狀態: 連線失敗';
            console.error("SCORM Initialization Failed.");
        }
    } else {
        document.getElementById('scorm-status').innerText = 'SCORM 狀態: 找不到 LMS API Wrapper';
        console.warn("LMS API Wrapper not found. Running in standalone mode.");
    }
}

/**
 * 在遊戲完成時提交成績和狀態
 */
function scormTerminate() {
    if (!SCORM_INITIALIZED) return;

    // 計算分數：總共正確射擊的干擾項 / 總共應射擊的干擾項
    let score = totalPossibleShots > 0 ? (totalCorrectShots / totalPossibleShots) * 100 : 0;
    
    // 將分數限制在 0-100 之間
    score = constrain(score, 0, 100);

    // 提交成績
    doLMSSetValue('cmi.score.raw', Math.round(score));
    doLMSSetValue('cmi.score.max', 100);
    doLMSSetValue('cmi.score.min', 0);
    
    // 設定完成狀態
    // 這裡我們假設完成測驗即為 Completed/Passed
    let completionStatus = 'completed'; // 只要完成題目就設為 completed
    // 錯誤率 > 0% 則為 'failed'
    let successStatus = incorrectlyShotWords.length === 0 ? 'passed' : 'failed'; 

    doLMSSetValue('cmi.completion_status', completionStatus);
    // SCORM 1.2 使用 cmi.core.lesson_status, 2004 使用 cmi.success_status
    doLMSSetValue('cmi.success_status', successStatus);
    // 為了兼容 1.2，也設定 lesson_status
    if (window.scorm && window.scorm.version === '1.2') {
        doLMSSetValue('cmi.core.lesson_status', successStatus === 'passed' ? 'passed' : 'failed');
    }


    // 提交資料並結束連線
    doLMSCommit();
    doLMSTerminate();
    
    document.getElementById('scorm-status').innerText = `SCORM 狀態: 已提交 ${Math.round(score)} 分`;
    console.log(`SCORM Data Submitted: Score=${Math.round(score)}, Success=${successStatus}`);
}


// --- 類別定義 (保持不變) ---
class Player {
    constructor() {
        this.w = PLAYER_W; 
        this.h = PLAYER_H;
        this.x = CANVAS_W / 2 - this.w / 2;
        this.y = CANVAS_H - 100; 
        this.speed = PLAYER_SPEED; 
    }
    show() {
        image(airplaneImg, this.x, this.y, this.w, this.h);
    }
    move() {
        if (keyIsDown(LEFT_ARROW)) {
            this.x = max(0, this.x - this.speed);
        }
        if (keyIsDown(RIGHT_ARROW)) {
            this.x = min(CANVAS_W - this.w, this.x + this.speed);
        }
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = BULLET_R; 
        this.speed = 15; 
        this.active = true;
    }
    show() {
        fill('#FF69B4'); 
        noStroke();
        ellipse(this.x, this.y, this.r * 2);
    }
    move() {
        this.y -= this.speed;
        if (this.y < 0) {
            this.active = false;
        }
    }
}

class Option {
    constructor(word, isTarget, x, y) {
        this.word = word;
        this.isTarget = isTarget; 
        this.x = x;
        this.y = y;
        this.w = OPTION_W; 
        this.h = OPTION_H; 
        this.hit = false;
        this.falling = false; 
        this.fallSpeed = 0; 
        this.baseColor = '#9BEEF0'; 
    }
    
    update() {
        if (this.falling) {
            this.y += this.fallSpeed;
            this.fallSpeed += 0.5; 
        }
    }

    show() {
        if (this.falling && this.y > CANVAS_H) return; 

        if (this.hit) {
            fill(255, 100, 100); 
        } else {
            fill(this.baseColor); 
        }
        rect(this.x, this.y, this.w, this.h, 15); 
        fill(0);
        textAlign(CENTER, CENTER);
        textSize(FONT_SIZE_OPTION); 
        text(this.word, this.x + this.w / 2, this.y + this.h / 2);
    }
    hits(bullet) {
        let d = dist(bullet.x, bullet.y, this.x + this.w / 2, this.y + this.h / 2);
        return (d < this.w / 2 + bullet.r);
    }
}

class BackgroundProp {
    constructor() {
        this.x = random(CANVAS_W);
        this.y = random(CANVAS_H);
        this.size = random(15, 30); 
        this.speedX = random(-0.3, 0.3);
        this.speedY = random(0.5, 1.0);
        this.alpha = random(50, 150);
    }
    show() {
        if(airplaneImg && airplaneImg.width > 0) {
            push(); 
            tint(255, this.alpha);
            image(airplaneImg, this.x, this.y, this.size, this.size * (PLAYER_H / PLAYER_W)); 
            pop();
        }
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.y > CANVAS_H + this.size) {
            this.y = -this.size;
            this.x = random(CANVAS_W);
        }
        if (this.x > CANVAS_W + this.size || this.x < -this.size) {
            this.speedX *= -1;
        }
    }
}


// --- p5.js 內建函式 ---

function setup() {
    const canvas = createCanvas(CANVAS_W, CANVAS_H); 
    canvas.parent('game-container'); 
    
    // 載入資料並計算總題數
    processCSVData();
    totalQuestions = questions.length; 
    
    if (totalQuestions === 0) {
        totalQuestions = 1; 
        console.warn("No questions loaded. Game may not function correctly.");
    }
    
    // 遊戲啟動時初始化 SCORM
    scormInitialize();

    player = new Player();
    
    for (let i = 0; i < 8; i++) {
        backgroundProps.push(new BackgroundProp());
    }
    
    gameState = 'START'; 
}

function draw() {
    background(macaronPink); 
    
    for (let prop of backgroundProps) {
        prop.update();
        prop.show();
    }
    
    if (gameState === 'START') {
        drawStartScreen();
    } else if (gameState === 'INSTRUCTIONS') { 
        drawInstructionsScreen();
    } else if (gameState === 'PLAYING') {
        
        player.move();
        player.show();

        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].move();
            bullets[i].show();
            checkCollision(bullets[i], i);
            if (!bullets[i].active) {
                bullets.splice(i, 1);
            }
        }
        
        if (currentQuestion && currentQuestion.options) {
            for (let option of currentQuestion.options) {
                option.update(); 
            }
        }
        
        drawProgressDisplay(); 
        drawQuestion();
        drawErrorOverlay(); 
        
    } else if (gameState === 'FINISHED') {
        drawFinishScreen();
    } else if (gameState === 'REVIEWING') { 
        drawReviewScreen();
    }
    
    if (errorTimer > 0) {
        errorTimer--;
    }
}

function keyPressed() {
    if (gameState === 'START' && keyCode === ENTER) {
        gameState = 'INSTRUCTIONS'; 
        return false; 
    }

    if (gameState === 'INSTRUCTIONS' && keyCode === ENTER) {
        if (questions.length > 0) {
            gameState = 'PLAYING';
            loadNewQuestion();
        } else {
            console.error("無法開始遊戲：未載入任何題目。");
            gameState = 'FINISHED'; 
        }
        return false;
    }
    
    if (gameState === 'PLAYING' && (key === ' ' || keyCode === 32)) { 
        bullets.push(new Bullet(player.x + player.w / 2, player.y));
        return false; 
    }
    
    if (gameState === 'FINISHED' && keyCode === ENTER) {
        // 重新開始遊戲時，先終止目前的 SCORM 連線並重置遊戲狀態
        scormTerminate(); 
        resetGame();
        // 重新初始化 SCORM
        scormInitialize();
        return false;
    }
    
    if (gameState === 'REVIEWING' && keyCode === ESCAPE) { 
        gameState = 'FINISHED';
        return false;
    }
}

function mousePressed() {
    if (gameState === 'FINISHED') {
        let btnX = CANVAS_W / 2 - BUTTON_W / 2;
        let btnY = CANVAS_H / 2 + 100;
        
        if (mouseX > btnX && mouseX < btnX + BUTTON_W &&
            mouseY > btnY && mouseY < btnY + BUTTON_H) {
            if (incorrectlyShotWords.length > 0) { 
                gameState = 'REVIEWING';
            }
        }
    }
}


// --- 遊戲核心邏輯 ---

function processCSVData() {
    if (!gameTable || !gameTable.getRows) {
        console.error("CSV file object is invalid or load failed.");
        questions = [];
        return;
    }
    
    let rows = gameTable.getRows();
    if (rows.length === 0) {
        console.warn("CSV file loaded, but contains no rows.");
        questions = [];
        return;
    }

    questions = rows.map(row => {
        const targetsStr = row.getString('targets') || '';
        const distractorsStr = row.getString('distractors') || '';
        
        let targets = targetsStr.split('|').filter(s => s.trim() !== '');
        let distractors = distractorsStr.split('|').filter(s => s.trim() !== '');
        
        // 移除 'bike' 選項的邏輯
        targets = targets.filter(word => word.trim() !== 'bike');
        distractors = distractors.filter(word => word.trim() !== 'bike');
        
        let options = [];
        targets.forEach(word => options.push({ word: word.trim(), isTarget: true }));
        distractors.forEach(word => options.push({ word: word.trim(), isTarget: false }));

        return {
            title: row.getString('title') || 'No Title',
            options: options,
            distractorCount: distractors.length
        };
    }).filter(q => q.options.length > 0); // 篩選掉沒有選項的題目

    // 重新計算總共應射擊的干擾項數量
    totalPossibleShots = questions.reduce((sum, q) => sum + q.distractorCount, 0);
}

function loadNewQuestion() {
    if (currentQuestionIndex >= questions.length) { 
        gameState = 'FINISHED';
        // 遊戲結束時提交成績
        scormTerminate();
        return;
    }
    
    let q = questions[currentQuestionIndex];
    currentQuestionMaxShots = q.distractorCount;
    currentQuestionCorrectShots = 0; 
    loadQuestionDisplay(q);
}


function loadQuestionDisplay(q) {
    currentQuestion = { title: q.title, options: [] };

    let allOptions = q.options;
    allOptions = shuffle(allOptions); 

    let totalOptions = allOptions.length;
    let optionWidth = OPTION_W;
    let margin = 20; 
    let spacing;
    
    if (totalOptions > 1) {
        spacing = (CANVAS_W - 2 * margin - totalOptions * optionWidth) / (totalOptions - 1); 
        spacing = max(10, spacing); 
    } else {
        spacing = 0;
    }
    
    let startX = (CANVAS_W - (totalOptions * optionWidth + (totalOptions - 1) * spacing)) / 2;
    let yPos = CANVAS_H / 4; 

    for (let i = 0; i < totalOptions; i++) {
        let xPos = startX + i * (optionWidth + spacing);
        currentQuestion.options.push(new Option(allOptions[i].word, allOptions[i].isTarget, xPos, yPos));
    }
}

function checkCollision(bullet, bulletIndex) {
    for (let i = currentQuestion.options.length - 1; i >= 0; i--) {
        let option = currentQuestion.options[i];
        
        if (option.hits(bullet) && !option.hit) { 
            option.hit = true; 
            bullet.active = false; 
            
            if (!option.isTarget) {
                currentQuestionCorrectShots++; 
                totalCorrectShots++; // 紀錄總共正確射擊數
                option.falling = true; 
                option.fallSpeed = 2;
                
                if (currentQuestionCorrectShots === currentQuestionMaxShots) {
                    currentQuestionIndex++; 
                    setTimeout(loadNewQuestion, 1000); 
                }
                
            } else {
                errorTimer = 30; 
                incorrectlyShotWords.push(option.word); 
                setTimeout(() => option.hit = false, 500); 
            }
            break; 
        }
    }
}

function drawProgressDisplay() {
    fill(50);
    textSize(22);
    textAlign(RIGHT, TOP);
    text(`進度: ${currentQuestionIndex} / ${questions.length} 題`, CANVAS_W - 20, 20); 
}

function drawQuestion() {
    fill(255, 255, 255, 220); 
    let textW = 700; 
    let textH = 70; 
    let xPos = CANVAS_W / 2 - textW / 2;
    let yPos = 50; 

    rect(xPos, yPos, textW, textH, 15);

    fill(50);
    textSize(28); 
    textAlign(CENTER, CENTER);
    text(currentQuestion.title, CANVAS_W / 2, yPos + textH / 2 - 10);
    
    textSize(20); 
    fill('#FF69B4');
    text("請射擊所有『不對』的單字！", CANVAS_W / 2, yPos + textH / 2 + 15);

    for (let option of currentQuestion.options) {
        if (!(option.falling && option.y > CANVAS_H)) {
             option.show();
        }
    }
}

function drawErrorOverlay() {
    if (errorTimer > 0) {
        fill(255, 100, 100, 150); 
        rect(0, CANVAS_H / 2 - 50, CANVAS_W, 100);

        fill(255);
        textSize(40);
        textAlign(CENTER, CENTER);
        text("錯誤！目標單字被擊中！", CANVAS_W / 2, CANVAS_H / 2);
    }
}

function drawStartScreen() {
    fill(255, 255, 255, 230);
    rect(0, 0, CANVAS_W, CANVAS_H);
    
    fill('#FF69B4');
    textSize(50);
    textAlign(CENTER, CENTER);
    text("歡迎來到英文射擊測驗", CANVAS_W / 2, CANVAS_H / 2 - 50);
    
    fill(50);
    textSize(30);
    text("按 [ Enter ] 開始", CANVAS_W / 2, CANVAS_H / 2 + 50);
}

function drawInstructionsScreen() {
    fill(255, 255, 255, 230);
    rect(0, 0, CANVAS_W, CANVAS_H);
    
    fill('#FF69B4');
    textSize(40);
    textAlign(CENTER, CENTER);
    text("遊戲玩法說明", CANVAS_W / 2, 80);

    fill(50);
    textSize(26);
    let startY = 150;
    let lineHeight = 50;

    text("目標：將所有不屬於題目清單的單字射掉。", CANVAS_W / 2, startY);
    text("目的：在不擊中目標單字的情況下，清除所有干擾項。", CANVAS_W / 2, startY + lineHeight);
    
    text("操作：", CANVAS_W / 2, startY + lineHeight * 2);

    text("✈️ 左右鍵：控制飛機移動", CANVAS_W / 2, startY + lineHeight * 3);
    text("🚀 空白鍵：射擊砲彈", CANVAS_W / 2, startY + lineHeight * 4);
    
    fill('#FF69B4');
    textSize(30);
    text("按 [ Enter ] 進入遊戲", CANVAS_W / 2, CANVAS_H - 80);
}

function drawFinishScreen() {
    fill(255, 255, 255, 200);
    rect(0, 0, CANVAS_W, CANVAS_H);
    
    fill('#FF69B4');
    textSize(50);
    textAlign(CENTER, CENTER);
    text("測驗完成！", CANVAS_W / 2, CANVAS_H / 2 - 100);

    let finalScore = totalPossibleShots > 0 ? (totalCorrectShots / totalPossibleShots) * 100 : 0;
    finalScore = constrain(finalScore, 0, 100);
    
    fill(50);
    textSize(30);
    // 顯示玩家的表現
    if (incorrectlyShotWords.length === 0) {
        text(`恭喜！滿分 ${Math.round(finalScore)} 分，沒有任何錯誤。`, CANVAS_W / 2, CANVAS_H / 2 + 50);
    } else {
        text(`得分：${Math.round(finalScore)} 分。您有 ${[...new Set(incorrectlyShotWords)].length} 個錯誤目標。`, CANVAS_W / 2, CANVAS_H / 2 + 50);
    }

    let btnX = CANVAS_W / 2 - BUTTON_W / 2;
    let btnY = CANVAS_H / 2 + 100;
    
    if (incorrectlyShotWords.length > 0) {
        fill('#A0D9B1');
        rect(btnX, btnY, BUTTON_W, BUTTON_H, 10);
        fill(50);
        textSize(24);
        text("查看錯題", btnX + BUTTON_W / 2, btnY + BUTTON_H / 2 + 5);
        
        fill(50);
        textSize(24);
        text("按 Enter 鍵重新開始", CANVAS_W / 2, CANVAS_H / 2 + 200);
    } else {
        textSize(24);
        text("按 Enter 鍵重新開始", CANVAS_W / 2, CANVAS_H / 2 + 150);
    }
}

function drawReviewScreen() {
    fill(255, 255, 255, 230);
    rect(0, 0, CANVAS_W, CANVAS_H);
    
    fill('#FF69B4');
    textSize(40);
    textAlign(CENTER, CENTER);
    text("您的錯題列表", CANVAS_W / 2, 80);

    fill(50);
    textSize(28);

    if (incorrectlyShotWords.length === 0) {
        text("恭喜！本次測驗沒有錯誤。", CANVAS_W / 2, CANVAS_H / 2);
    } else {
        let uniqueErrors = [...new Set(incorrectlyShotWords)];
        let startX = 150; 
        let startY = 150;
        let col = 0;
        let row = 0;

        for (let i = 0; i < uniqueErrors.length; i++) {
            fill(255, 100, 100);
            rect(startX + col * 200, startY + row * 60, 160, 40, 5); 
            fill(255);
            textSize(20);
            text(uniqueErrors[i], startX + col * 200 + 80, startY + row * 60 + 20);

            col++;
            if (col >= 3) { 
                col = 0;
                row++;
            }
        }
    }
    
    fill('#FF69B4');
    textSize(24);
    text("按 [ ESC ] 鍵返回", CANVAS_W / 2, CANVAS_H - 50);
}

function resetGame() {
    currentQuestionIndex = 0;
    currentQuestionCorrectShots = 0;
    incorrectlyShotWords = []; 
    bullets = [];
    totalCorrectShots = 0; 
    totalPossibleShots = 0; 
    processCSVData(); 
    gameState = 'START'; 
}

// 輔助函式：用於打亂陣列
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = floor(random(currentIndex));
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}