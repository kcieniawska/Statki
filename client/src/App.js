import React, { useState, useCallback, useEffect, useRef  } from 'react';
import './App.css';

const SIZE = 10;
const FLEET_TEMPLATE = [
  { size: 4, count: 1 },
  { size: 3, count: 2 },
  { size: 2, count: 3 },
  { size: 1, count: 4 },
];

function createEmptyBoard() {
  return Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
}

function Tile({ cell, onClick, disabled }) {
  let bgColor = '#1e293b';
  let cursor = disabled ? 'default' : 'pointer';
  let display = cell;

  if (cell === '🚢') bgColor = 'rgba(228, 242, 233,0.2)';
  else if (cell === '💥') {
    bgColor = '#ef4444';
    display = '💥';
  } else if (cell === '🌊') bgColor = '#3b82f6';
  else if (cell === '🔥') {
    bgColor = '#facc15';
    display = '🔥';
  } else if (cell === '☠️') {
    bgColor = '#9d174d';
    display = '☠️';
  } else if (cell === null) {
    display = '';
  }

  return (
    <div
      className="tile"
      style={{ backgroundColor: bgColor, cursor }}
      onClick={disabled ? undefined : onClick}
    >
      {display}
    </div>
  );
}

function canPlaceShip(board, x, y, size, orientation) {
  if (orientation === 'horizontal') {
    if (x + size > SIZE) return false;
  } else {
    if (y + size > SIZE) return false;
  }

  for (let i = 0; i < size; i++) {
    const cx = orientation === 'horizontal' ? x + i : x;
    const cy = orientation === 'horizontal' ? y : y + i;

    for (let ny = cy - 1; ny <= cy + 1; ny++) {
      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (board[ny][nx] === '🚢') return false;
      }
    }
  }
  return true;
}

function placeShip(board, x, y, size, orientation) {
  const newBoard = board.map(row => [...row]);
  for (let i = 0; i < size; i++) {
    if (orientation === 'horizontal') {
      newBoard[y][x + i] = '🚢';
    } else {
      newBoard[y + i][x] = '🚢';
    }
  }
  return newBoard;
}

function markSunkShips(board) {
  const newBoard = board.map(row => [...row]);
  const visited = Array(SIZE).fill(null).map(() => Array(SIZE).fill(false));

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if ((board[y][x] === '🚢' || board[y][x] === '💥' || board[y][x] === '🔥' || board[y][x] === '☠️') && !visited[y][x]) {
        let shipCoords = [];
        let i = 0;

        // Sprawdź poziomo
        while (x + i < SIZE && ['🚢','💥','🔥','☠️'].includes(board[y][x + i])) {
          shipCoords.push([x + i, y]);
          visited[y][x + i] = true;
          i++;
        }

        // Jeśli tylko jeden element, sprawdź pionowo
        if (shipCoords.length === 1) {
          i = 1;
          while (y + i < SIZE && ['🚢','💥','🔥','☠️'].includes(board[y + i][x])) {
            shipCoords.push([x, y + i]);
            visited[y + i][x] = true;
            i++;
          }
        }

        // Czy cały statek jest trafiony?
        const allHit = shipCoords.every(([sx, sy]) =>
          ['💥','🔥','☠️'].includes(board[sy][sx])
        );

        if (allHit) {
          // Zamień cały statek na ☠️ (zatopiony)
          shipCoords.forEach(([sx, sy]) => {
            newBoard[sy][sx] = '☠️';
          });
        } else {
          // Jeśli nie zatopiony, zostaw trafione pola jako 🔥
          shipCoords.forEach(([sx, sy]) => {
            if (['💥', '☠️'].includes(board[sy][sx])) {
              newBoard[sy][sx] = '🔥';
            } else if (board[sy][sx] === '🚢') {
              newBoard[sy][sx] = '🚢';
            }
          });
        }
      }
    }
  }

  return newBoard;
}


function checkWin(board, shipSymbol) {
  return !board.some(row => row.includes(shipSymbol));
}

function Popup({ message, onClose, isPlayerWinner }) {
  return (
    <div className="popup-backdrop">
      <div className="popup">
        {isPlayerWinner ? (
          <>
            <h2>🎉 Wygrałeś! 🎉</h2>
            <p>Wszystkie statki przeciwnika zatopione.</p>
          </>
        ) : (
          <>
            <h2>😢 Przegrałeś 😢</h2>
            <p>Twoje statki zostały zatopione.</p>
          </>
        )}
        <button onClick={onClose}>Zagraj ponownie</button>
      </div>
    </div>
  );
}

function App() {
  const [gamePhase, setGamePhase] = useState('start');
  const [startPage, setStartPage] = useState('opis');
  const [playerBoard, setPlayerBoard] = useState(createEmptyBoard());
  const [enemyBoard, setEnemyBoard] = useState(createEmptyBoard());
  const [fleet, setFleet] = useState(JSON.parse(JSON.stringify(FLEET_TEMPLATE)));
  const [orientation, setOrientation] = useState('horizontal');
  const [playerTurn, setPlayerTurn] = useState('player');
  const [message, setMessage] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [computerHits, setComputerHits] = useState([]);
    const [playerHits, setPlayerHits] = useState([]);
  const playerHitsRef = useRef([]);

  const computerHitsRef = useRef([]);

  const resetSetup = () => {
    setPlayerBoard(createEmptyBoard());
    setFleet(JSON.parse(JSON.stringify(FLEET_TEMPLATE)));
    setMessage('Ustaw statki ręcznie lub losowo.');
  };

  const randomPlacement = useCallback(() => {
    let newBoard = createEmptyBoard();
    let newFleet = JSON.parse(JSON.stringify(FLEET_TEMPLATE));

    for (let { size, count } of newFleet) {
      for (let i = 0; i < count; i++) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 1000) {
          const orientationRnd = Math.random() < 0.5 ? 'horizontal' : 'vertical';
          const maxX = orientationRnd === 'horizontal' ? SIZE - size : SIZE - 1;
          const maxY = orientationRnd === 'vertical' ? SIZE - size : SIZE - 1;
          const x = Math.floor(Math.random() * (maxX + 1));
          const y = Math.floor(Math.random() * (maxY + 1));

          if (canPlaceShip(newBoard, x, y, size, orientationRnd)) {
            newBoard = placeShip(newBoard, x, y, size, orientationRnd);
            placed = true;
          }
          attempts++;
        }
        if (!placed) {
          setMessage('Nie udało się rozmieścić wszystkich statków.');
          return;
        }
      }
    }

    setPlayerBoard(newBoard);
    setFleet(newFleet.map((f) => ({ ...f, count: 0 })));
    setMessage('Statki rozmieszczone losowo. Kliknij "Rozpocznij bitwę".');
  }, []);

  const handlePlaceShip = (x, y) => {
    if (gamePhase !== 'setup') return;
    const shipToPlace = fleet.find(f => f.count > 0);
    if (!shipToPlace) {
      setMessage('Wszystkie statki ustawione. Kliknij "Rozpocznij bitwę".');
      return;
    }
    const { size } = shipToPlace;

    if (!canPlaceShip(playerBoard, x, y, size, orientation)) {
      setMessage('Nie można tu postawić statku.');
      return;
    }

    const newBoard = placeShip(playerBoard, x, y, size, orientation);
    setPlayerBoard(newBoard);

    const newFleet = fleet.map(f =>
      f.size === size ? { ...f, count: f.count - 1 } : f
    );
    setFleet(newFleet);
    setMessage(`Postawiono statek o rozmiarze ${size}.`);
  };

  const startGame = () => {
    if (fleet.some(f => f.count > 0)) {
      setMessage('Najpierw ustaw wszystkie statki!');
      return;
    }
    setGamePhase('game');
  const generateEnemyBoard = () => {
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
      if (!placed) {
        // Zapobiegamy nieskończonej pętli i informujemy
        setMessage('Nie udało się rozmieścić wszystkich statków komputera.');
        return createEmptyBoard(); // lub inaczej obsłuż błąd
      }
    }
  }
  return board;
};

setEnemyBoard(generateEnemyBoard());

    setPlayerTurn('player');
    setMessage('🚀 Gra rozpoczęta! Twoja kolej, strzelaj!');
    setGameOver(false);
  };

  const computerShotsRef = useRef(new Set());

const fire = (x, y) => {
  setEnemyBoard(prevBoard => {
    const currentCell = prevBoard[y][x];
    // Jeśli pole już było trafione lub pudło, nic nie rób
    if (currentCell === '🔥' || currentCell === '🌊' || currentCell === '☠️') {
      setMessage('Już tu strzelałeś!');
      return prevBoard; // nie zmieniamy planszy
    }

    const newBoard = prevBoard.map(row => [...row]);

    if (newBoard[y][x] === '🚢') {
      newBoard[y][x] = '🔥';
      const updatedBoard = markSunkShips(newBoard);

      setPlayerHits([...playerHits, [x, y]]);
      playerHitsRef.current = [...playerHits, [x, y]];

      if (checkWin(updatedBoard, '🚢')) {
        setMessage('Gratulacje, wygrałeś!');
        setGameOver(true);
        return updatedBoard;
      }

      setMessage('Trafiony! Strzelaj dalej...');
      return updatedBoard;
    } else {
      newBoard[y][x] = '🌊';
      setMessage('Pudło! Ruch komputera.');
      setPlayerTurn('computer');
      return newBoard;
    }
  });
};


const computerTurn = useCallback(() => {
  if (gameOver || playerTurn !== 'computer') return;

  const shots = computerShotsRef.current;
  const hits = [...computerHitsRef.current];

  let x, y;

  if (hits.length > 0) {
    const [lastX, lastY] = hits[hits.length - 1];
    const candidates = [
      [lastX + 1, lastY],
      [lastX - 1, lastY],
      [lastX, lastY + 1],
      [lastX, lastY - 1],
    ].filter(([nx, ny]) =>
      nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE &&
      !shots.has(`${nx},${ny}`)
    );

    if (candidates.length > 0) {
      [x, y] = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      do {
        x = Math.floor(Math.random() * SIZE);
        y = Math.floor(Math.random() * SIZE);
      } while (shots.has(`${x},${y}`));
    }
  } else {
    do {
      x = Math.floor(Math.random() * SIZE);
      y = Math.floor(Math.random() * SIZE);
    } while (shots.has(`${x},${y}`));
  }

  shots.add(`${x},${y}`);

  setPlayerBoard(prevBoard => {
    const newBoard = prevBoard.map(row => [...row]);

    if (newBoard[y][x] === '🚢') {
      newBoard[y][x] = '🔥';
      const updatedBoard = markSunkShips(newBoard);
      return updatedBoard;
    } else {
      newBoard[y][x] = '🌊';
      return newBoard;
    }
  });

  setTimeout(() => {
  const newHits = [...hits];
  const newBoard = playerBoard.map(row => [...row]);

  if (newBoard[y][x] === '🚢') {
    newBoard[y][x] = '🔥';
    const updatedBoard = markSunkShips(newBoard); // jeśli masz oznaczanie zatopionych

    const updatedHits = [...hits, [x, y]];
    setComputerHits(updatedHits);
    computerHitsRef.current = updatedHits;

    setPlayerBoard(updatedBoard);

    if (checkWin(updatedBoard, '🚢')) {
      setMessage('Niestety, komputer wygrał 😞');
      setGameOver(true);
      return;
    }

    setMessage('Komputer trafił! Strzela dalej...');
    setPlayerTurn('computer');
  } else {
    newBoard[y][x] = '🌊';
    setPlayerBoard(newBoard);
    setMessage('Komputer chybił! Twoja kolej.');
    setPlayerTurn('player');
    setComputerHits([]);
    computerHitsRef.current = [];
  }
}, 50);
  
}, [gameOver, playerTurn, playerBoard]);
useEffect(() => {
    if (playerTurn === 'computer' && !gameOver) {
      const timer = setTimeout(() => {
        computerTurn();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [playerTurn, gameOver, computerTurn]);

  const resetGame = () => {
    setGamePhase('start');
    setStartPage('opis');
    setPlayerBoard(createEmptyBoard());
    setEnemyBoard(createEmptyBoard());
    setFleet(JSON.parse(JSON.stringify(FLEET_TEMPLATE)));
    setOrientation('horizontal');
    setPlayerTurn('player');
    setMessage('');
    setGameOver(false);
    setComputerHits([]);
  };

  return (
    <div className="app">
      {gamePhase === 'start' && (
        <>
          <img src="/images/ship.png" alt="Statek" className="ship-image" />
          <h1 className="animated-title">Statki</h1>

          <nav style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setStartPage('opis')}
              disabled={startPage === 'opis'}
              style={{ marginRight: '1rem' }}
            >
              Opis statków
            </button>
            <button
              onClick={() => setStartPage('autor')}
              disabled={startPage === 'autor'}
            >
              Autor
            </button>
          </nav>

          {startPage === 'opis' && (
            <div className="description">
              <p>
                Gra <span>Statki</span> to klasyczna gra planszowa, w której gracze rozmieszczają
                swoje statki na planszy i próbują zatopić flotę przeciwnika, strzelając w
                pola planszy.
              </p>
              <p>Rozmieść statki na planszy, a następnie rozpocznij bitwę!</p>
            </div>
          )}

          {startPage === 'autor' && (
            <div className="description">
              <p><h3>Karolina Cieniawska</h3>
              Studentka II roku Informatyki Ekonomicznej</p><br></br>
              <p>Kontakt: <a href="mailto:14690@eans-nt.edu.pl">14690@eans-nt.edu.pl</a></p>
              <p>Projekt stworzony w ramach przedmiotu <br></br>"<span>Aplikacje Webowe</span>"<br></br> na Akademii Nauk Stosowanych w Nowym Targu</p>
            </div>
          )}

          <button onClick={() => setGamePhase('setup')} style={{ marginTop: '1rem' }}>
            Start
          </button>
        </>
      )}

      {gamePhase === 'setup' && (
        <>
          <h2>Ustaw swoje statki</h2>
          <p>
            Kliknij na planszę, aby postawić statek
          </p>
          <div className="button-group" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
  <button onClick={() => setOrientation(orientation === 'horizontal' ? 'vertical' : 'horizontal')}>
    Orientacja:  {orientation === 'horizontal' ? 'Pozioma' : 'Pionowa'}
  </button>

  <button onClick={randomPlacement}>
    Ustaw losowo
  </button>
  <button onClick={resetSetup}>
    Resetuj ustawienia
  </button>
</div>

          <div className="board" style={{ marginTop: '1rem' }}>
            {playerBoard.map((row, y) =>
              row.map((cell, x) => (
                <Tile
                  key={`${x}-${y}`}
                  cell={cell}
                  onClick={() => handlePlaceShip(x, y)}
                  disabled={fleet.every(f => f.count === 0)}
                />
              ))
            )}
          </div>

          <button
            onClick={startGame}
            style={{ marginTop: '1rem' }}
            disabled={fleet.some(f => f.count > 0)}
          >
            Rozpocznij bitwę
          </button>
          <p>{message}</p>
        </>
      )}

     {gamePhase === 'game' && (
  <>
    <p>{message}</p>
    <div className="boards-container">
      {/* Plansza gracza */}
      <div>
        <h3>Twoja plansza</h3>
        <div className="board">
          {playerBoard.map((row, y) =>
            row.map((cell, x) => <Tile key={`${x}-${y}`} cell={cell} disabled />)
          )}
        </div>
      </div>

      {/* Plansza przeciwnika */}
      <div>
        <h3>Plansza przeciwnika</h3>
        <div className="board">
          {enemyBoard.map((row, y) =>
            row.map((cell, x) => (
              <Tile
                key={`${x}-${y}`}
                cell={cell === '🚢' ? null : cell}
                onClick={() => fire(x, y)}
                disabled={playerTurn !== 'player' || gameOver}
              />
            ))
          )}
        </div>
      </div>
    </div>

    {/* Przycisk Nowa gra */}
    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
      <button onClick={resetGame}>Nowa gra</button>
    </div>
  </>
)}



      {gameOver && <Popup message={message} onClose={resetGame} />}
    </div>
  );
}

export default App;