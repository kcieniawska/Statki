const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;
const favicon = require('serve-favicon');
const path = require('path');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// Pozostałe middleware i routing
app.use(express.static(path.join(__dirname, 'build'))); // jeśli serwujesz Reacta


app.use(cors());
app.use(express.json());

const SIZE = 10;
const FLEET_TEMPLATE = [
  { size: 4, count: 1 },
  { size: 3, count: 2 },
  { size: 2, count: 3 },
  { size: 1, count: 4 },
];

let playerBoard = null;   // plansza gracza
let enemyBoard = null;    // plansza komputera
let playerTurn = null;    // 'player' lub 'computer'
let gameOver = false;

// Tworzenie pustej planszy
function createEmptyBoard() {
  return Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
}

// Sprawdza, czy statek mieści się na planszy i czy można go tam położyć (wraz z buforem 1 pola)
function canPlaceShip(board, x, y, size, orientation) {
  // Najpierw sprawdzamy, czy statek mieści się na planszy
  if (orientation === 'horizontal' && x + size > SIZE) return false;
  if (orientation === 'vertical' && y + size > SIZE) return false;

  // Sprawdzamy obszar 1 pola wokół statku
  const startX = x - 1;
  const startY = y - 1;
  const endX = orientation === 'horizontal' ? x + size : x + 1;
  const endY = orientation === 'horizontal' ? y + 1 : y + size;

  for (let i = startY; i <= endY; i++) {
    for (let j = startX; j <= endX; j++) {
      if (i < 0 || i >= SIZE || j < 0 || j >= SIZE) continue;
      if (board[i][j] === '🚢') {
        return false;
      }
    }
  }

  return true;
}

// Umieszcza statek na planszy (nie modyfikuje oryginału, zwraca kopię)
function placeShip(board, x, y, size, orientation) {
  const newBoard = board.map(row => [...row]);
  if (orientation === 'horizontal') {
    for (let i = 0; i < size; i++) {
      newBoard[y][x + i] = '🚢';
    }
  } else {
    for (let i = 0; i < size; i++) {
      newBoard[y + i][x] = '🚢';
    }
  }
  return newBoard;
}

// Losowe rozmieszczenie statków zgodnie z flotą
function randomPlacement() {
  let board = createEmptyBoard();
  for (let { size, count } of FLEET_TEMPLATE) {
    for (let i = 0; i < count; i++) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 1000) {
        const orientationRnd = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const maxX = orientationRnd === 'horizontal' ? SIZE - size : SIZE - 1;
        const maxY = orientationRnd === 'vertical' ? SIZE - size : SIZE - 1;
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        if (canPlaceShip(board, x, y, size, orientationRnd)) {
          board = placeShip(board, x, y, size, orientationRnd);
          placed = true;
        }
        attempts++;
      }
      if (!placed) throw new Error('Nie udało się rozmieścić statków komputera.');
    }
  }
  return board;
}

// Sprawdza, czy wszystkie statki na planszy zostały zatopione
function areAllShipsSunk(board) {
  return !board.some(row => row.includes('🚢'));
}

// Sprawdza czy pole na planszy jest nieodkryte przez komputer (czy można w nie strzelać)
const isUntouched = (board, x, y) => !['X', '🌊', '💥'].includes(board[y][x]);

// Endpoint startu gry - otrzymuje planszę gracza
app.post('/start', (req, res) => {
  const pBoard = req.body.playerBoard;

  if (
    !pBoard ||
    !Array.isArray(pBoard) ||
    pBoard.length !== SIZE ||
    !pBoard.every(row => Array.isArray(row) && row.length === SIZE)
  ) {
    return res.json({ success: false, message: 'Niepoprawna plansza gracza.' });
  }

  playerBoard = pBoard;
  enemyBoard = randomPlacement();
  playerTurn = 'player';
  gameOver = false;

  res.json({ success: true, message: 'Gra rozpoczęta.' });
});

// Ruch gracza - strzał w planszę przeciwnika
app.post('/fire', (req, res) => {
  if (gameOver) return res.json({ message: 'Gra zakończona.', gameOver: true });
  if (playerTurn !== 'player') return res.json({ message: 'Nie Twoja kolej.', gameOver: false });

  const { x, y } = req.body;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    x < 0 || x >= SIZE ||
    y < 0 || y >= SIZE
  ) {
    return res.json({ message: 'Niepoprawne współrzędne.', gameOver: false });
  }

  const cell = enemyBoard[y][x];
  if (cell === '💥' || cell === '🌊') {
    return res.json({ message: 'Już tam strzelałeś.', gameOver: false });
  }

  let hit = false;
  if (cell === '🚢') {
    enemyBoard[y][x] = '💥';
    hit = true;
  } else {
    enemyBoard[y][x] = '🌊';
  }

  let message = hit ? 'Trafiony!' : 'Pudło!';
  let nextTurn = hit ? 'player' : 'computer';

  if (areAllShipsSunk(enemyBoard)) {
    gameOver = true;
    message = 'Wygrałeś! Wszystkie statki przeciwnika zatopione.';
    return res.json({ hit, message, gameOver: true, nextTurn: null, updatedEnemyBoard: enemyBoard });
  }

  playerTurn = nextTurn;
  res.json({ hit, message, gameOver: false, nextTurn, updatedEnemyBoard: enemyBoard });
});

// --- Logika ruchu komputera ---

let hitStack = [];
let targetDirection = null;
let triedDirections = [];

const directions = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const isValid = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

const resetTargeting = () => {
  hitStack = [];
  targetDirection = null;
  triedDirections = [];
};

const pickRandom = (board) => {
  let attempts = 0;
  let x, y;
  do {
    x = Math.floor(Math.random() * SIZE);
    y = Math.floor(Math.random() * SIZE);
    attempts++;
    if (attempts > 1000) break;
  } while (!isUntouched(board, x, y));
  return [x, y];
};

app.post('/computer-turn', (req, res) => {
  if (gameOver) return res.json({ message: 'Gra zakończona.', gameOver: true });
  if (playerTurn !== 'computer') return res.json({ message: 'Nie kolej komputera.', gameOver: false });

  const updatedPlayerBoard = playerBoard.map(row => [...row]);

  let x, y;
  let hit = false;

  if (hitStack.length === 0) {
    // Brak celowania – losuj pole
    [x, y] = pickRandom(updatedPlayerBoard);
  } else {
    // Mamy cel - próbujemy strzelać w wybranym kierunku
    if (!targetDirection) {
      const possibleDirs = Object.keys(directions).filter(dir => !triedDirections.includes(dir));
      if (possibleDirs.length === 0) {
        resetTargeting();
        [x, y] = pickRandom(updatedPlayerBoard);
      } else {
        targetDirection = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      }
    }

    if (targetDirection) {
      const [dx, dy] = directions[targetDirection];
      const lastHit = hitStack[hitStack.length - 1];
      x = lastHit[0] + dx;
      y = lastHit[1] + dy;

      if (!isValid(x, y) || !isUntouched(updatedPlayerBoard, x, y)) {
        // Kierunek zablokowany – dodaj do próbowanych i resetuj kierunek
        triedDirections.push(targetDirection);
        targetDirection = null;

        // Spróbuj kolejnych kierunków lub losuj
        const possibleDirs = Object.keys(directions).filter(dir => !triedDirections.includes(dir));
        if (possibleDirs.length > 0 && hitStack.length > 0) {
          targetDirection = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
          const [ddx, ddy] = directions[targetDirection];
          const last = hitStack[hitStack.length - 1];
          x = last[0] + ddx;
          y = last[1] + ddy;

          if (!isValid(x, y) || !isUntouched(updatedPlayerBoard, x, y)) {
            resetTargeting();
            [x, y] = pickRandom(updatedPlayerBoard);
          }
        } else {
          resetTargeting();
          [x, y] = pickRandom(updatedPlayerBoard);
        }
      }
    }
  }

  // Wykonaj strzał
  if (updatedPlayerBoard[y][x] === '🚢') {
    updatedPlayerBoard[y][x] = '🔥';
    hit = true;
    hitStack.push([x, y]);
    triedDirections = [];

    // Sprawdzenie czy statek jest zatopiony (brak sąsiadujących '🚢')
    const isSunk = !hitStack.some(([hx, hy]) =>
      Object.values(directions).some(([dx, dy]) => {
        const nx = hx + dx;
        const ny = hy + dy;
        return isValid(nx, ny) && updatedPlayerBoard[ny][nx] === '🚢';
      })
    );

    if (isSunk) {
      resetTargeting();
    }
  } else {
    updatedPlayerBoard[y][x] = '🌊';
    if (hitStack.length > 0) {
      triedDirections.push(targetDirection);
      targetDirection = null;
    }
  }

  playerBoard = updatedPlayerBoard;

  let message = hit ? 'Komputer trafił!' : 'Komputer pudłuje.';
  let nextTurn = hit ? 'computer' : 'player';

  if (areAllShipsSunk(playerBoard)) {
    gameOver = true;
    message = 'Przegrałeś! Komputer zatopił wszystkie Twoje statki.';
    nextTurn = null;
  }

  playerTurn = nextTurn;

  return res.json({
    message,
    gameOver,
    nextTurn,
    updatedPlayerBoard: playerBoard,
  });
});

app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
