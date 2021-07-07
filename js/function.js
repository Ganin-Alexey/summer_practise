;(function() {
	'use strict';
	/*
	0 - пустое место
	1 - палуба корабля
	2 - клетка рядом с кораблём
	3 - обстрелянная клетка
	4 - попадание в палубу
	*/
	let RESURRECTION = 2
    let SPEED = 100
	// флаг начала игры, устанавливается после нажатия кнопки 'Play' и запрещает
	// редактирование положения кораблей
	let startGame = false;
	// флаг установки обработчиков событий ручного размещения кораблей и
	// редактирование их положения
	let isHandlerPlacement = false;
	// флаг установки обработчиков событий ведения морского боя
	let isHandlerController = false;
	// флаг, блокирующий действия игрока во время выстрела компьютера
	let compShot = false;

	// получаем объект элемента DOM по его ID
	const getElement = id => document.getElementById(id);
	// вычисляем координаты всех сторон элемента относительно окна браузера
	// с учётом прокрутки страницы
	const getCoordinates = el => {
		const coords = el.getBoundingClientRect();
		return {
			left: coords.left + window.pageXOffset,
			right: coords.right + window.pageXOffset,
			top: coords.top + window.pageYOffset,
			bottom: coords.bottom + window.pageYOffset
		};
	};

	// игровое поле игрока
	const humanfield = getElement('field_human');
	// игровое поле компьютера
	const computerfield = getElement('field_computer');

    const logs = getElement('logs');

	class Field {
		// размер стороны игрового поля в px
		static FIELD_SIDE = 330;
		// размер палубы корабля в px
		static SHIP_SIDE = 33;
		// объект с данными кораблей
		// ключём будет являться тип корабля, а значением - массив,
		// первый элемент которого указывает кол-во кораблей данного типа,
		// второй элемент указывает кол-во палуб у корабля данного типа
		static SHIP_DATA = {
			fourdeck: [1, 4],
			tripledeck: [2, 3],
			doubledeck: [3, 2],
			singledeck: [4, 1]
		};

		constructor(field) {
			// объект игрового поля, полученный в качестве аргумента
			this.field = field;
			// создаём пустой объект, куда будем заносить данные по каждому созданному кораблю
			// эскадры, подробно эти данные рассмотрим при создании объектов кораблей
			this.squadron = {};
			// двумерный массив, в который заносятся координаты кораблей, а в ходе морского
			// боя, координаты попаданий, промахов и заведомо пустых клеток
			this.matrix = [];
			// получаем координаты всех четырёх сторон рамки игрового поля относительно начала
			// document, с учётом возможной прокрутки по вертикали
			let { left, right, top, bottom } = getCoordinates(this.field);
			this.fieldLeft = left;
			this.fieldRight = right;
			this.fieldTop = top;
			this.fieldBottom = bottom;
		}

		static createMatrix() {
			return [...Array(10)].map(() => Array(10).fill(0));
		}
		// n - максимальное значение, которое хотим получить
		static getRandom = n => Math.floor(Math.random() * (n + 1));

		cleanField() {
			while (this.field.firstChild) {
				this.field.removeChild(this.field.firstChild);
			}
			this.squadron = {};
			this.matrix = Field.createMatrix();
		}

        randomNuclearBomb() {
            const bomb = new NuclearBomb(this);
            let obj = this.getCoordsDecks(1);
            bomb.createBomb(obj);
        }

        randomResurrection() {
            const resurrection = new Resurrection(this);
            for(let i=0; i < RESURRECTION; i++) {
                let obj = this.getCoordsDecks(1);
                resurrection.createResurrection(obj);
            }
        }

		randomLocationShips() {
			for (let type in Field.SHIP_DATA) {
				// кол-во кораблей данного типа
				let count = Field.SHIP_DATA[type][0];
				// кол-во палуб у корабля данного типа
				let decks = Field.SHIP_DATA[type][1];
				// прокручиваем кол-во кораблей
				for (let i = 0; i < count; i++) {
					// получаем координаты первой палубы и направление расположения палуб (корабля)
					let options = this.getCoordsDecks(decks);
					// кол-во палуб
					options.decks = decks;
					// имя корабля, понадобится в дальнейшем для его идентификации
					options.shipname = type + String(i + 1);
					// создаём экземпляр корабля со свойствами, указанными в
					// объекте options с помощью класса Ship
					const ship = new Ships(this, options);
					ship.createShip();
				}
			}
		}

		getCoordsDecks(decks) {
			// получаем коэффициенты определяющие направление расположения корабля
			// kx == 0 и ky == 1 — корабль расположен горизонтально,
			// kx == 1 и ky == 0 - вертикально.
			let kx = Field.getRandom(1), ky = (kx == 0) ? 1 : 0,
				x, y;

			// в зависимости от направления расположения, генерируем
			// начальные координаты
			if (kx == 0) {
				x = Field.getRandom(9); y = Field.getRandom(10 - decks);
			} else {
				x = Field.getRandom(10 - decks); y = Field.getRandom(9);
			}

			const obj = {x, y, kx, ky}
			// проверяем валидность координат всех палуб корабля
			const result = this.checkLocationShip(obj, decks);
			// если координаты невалидны, снова запускаем функцию
			if (!result) return this.getCoordsDecks(decks);
			return obj;
		}

		checkLocationShip(obj, decks) {
			let { x, y, kx, ky, fromX, toX, fromY, toY } = obj;

			// формируем индексы, ограничивающие двумерный массив по оси X (строки)
			// если координата 'x' равна нулю, то это значит, что палуба расположена в самой
			// верхней строке, т. е. примыкает к верхней границе и началом цикла будет строка
			// с индексом 0, в противном случае, нужно начать проверку со строки с индексом
			// на единицу меньшим, чем у исходной, т.е. находящейся выше исходной строки
			fromX = (x == 0) ? x : x - 1;
			// если условие истинно - это значит, что корабль расположен вертикально и его
			// последняя палуба примыкает к нижней границе игрового поля
			// поэтому координата 'x' последней палубы будет индексом конца цикла
			if (x + kx * decks == 10 && kx == 1) toX = x + kx * decks;
			// корабль расположен вертикально и между ним и нижней границей игрового поля
			// есть, как минимум, ещё одна строка, координата этой строки и будет
			// индексом конца цикла
			else if (x + kx * decks < 10 && kx == 1) toX = x + kx * decks + 1;
			// корабль расположен горизонтально вдоль нижней границы игрового поля
			else if (x == 9 && kx == 0) toX = x + 1;
			// корабль расположен горизонтально где-то по середине игрового поля
			else if (x < 9 && kx == 0) toX = x + 2;

			// формируем индексы начала и конца выборки по столбцам
			// принцип такой же, как и для строк
			fromY = (y == 0) ? y : y - 1;
			if (y + ky * decks == 10 && ky == 1) toY = y + ky * decks;
			else if (y + ky * decks < 10 && ky == 1) toY = y + ky * decks + 1;
			else if (y == 9 && ky == 0) toY = y + 1;
			else if (y < 9 && ky == 0) toY = y + 2;

			if (toX === undefined || toY === undefined) return false;

			// отфильтровываем ячейки, получившегося двумерного массива,
			// содержащие 1, если такие ячейки существуют - возвращаем false
			if (this.matrix.slice(fromX, toX)
				.filter(arr => arr.slice(fromY, toY).includes(1))
				.length > 0) return false;
			return true;
		}
	}

	///////////////////////////////////////////

	class Ships {
		constructor(self, { x, y, kx, ky, decks, shipname }) {
			// с каким экземпляром работаем
			this.player = (self === human) ? human : computer;
			// this.player = self;
			// на каком поле создаётся данный корабль
			this.field = self.field;
			// уникальное имя корабля
			this.shipname = shipname;
			//количество палуб
			this.decks = decks;
			// координата X первой палубы
			this.x = x;
		 	// координата Y первой палубы
			this.y = y;
			// направлении расположения палуб
			this.kx = kx;
			this.ky = ky;
			// счётчик попаданий
			this.hits = 0;
			// массив с координатами палуб корабля, является элементом squadron
			this.arrDecks = [];
		}

		static showShip(self, shipname, x, y, kx) {
			// создаём новый элемент с указанным тегом
			const div = document.createElement('div');
			// из имени корабля убираем цифры и получаем имя класса
			const classname = shipname.slice(0, -1);
			// получаем имя класса в зависимости от направления расположения корабля
			const dir = (kx == 1) ? ' vertical' : '';

			// устанавливаем уникальный идентификатор для корабля
			div.setAttribute('id', shipname);
			// собираем в одну строку все классы
			div.className = `ship ${classname}${dir}`;
			// через атрибут 'style' задаём позиционирование кораблю относительно
			// его родительского элемента
			// смещение вычисляется путём умножения координаты первой палубы на
			// размер клетки игрового поля, этот размер совпадает с размером палубы
			div.style.cssText = `left:${y * Field.SHIP_SIDE}px; top:${x * Field.SHIP_SIDE}px;`;
			self.field.appendChild(div);
		}

		createShip() {
			let { player, field, shipname, decks, x, y, kx, ky, hits, arrDecks, k = 0 } = this;

			while (k < decks) {
				// записываем координаты корабля в двумерный массив игрового поля
				// если коэффициент равен 1, то соответствующая координата будет
				// увеличиваться при каждой итерации
				// если равен нулю, то координата будет оставаться неизменной
				let i = x + k * kx, j = y + k * ky;

				// значение 1, записанное в ячейку двумерного массива, говорит о том, что
				// по данным координатам находится палуба некого корабля
				player.matrix[i][j] = 1;
				// записываем координаты палубы
				arrDecks.push([i, j]);
				k++;
			}

			// заносим информацию о созданном корабле в объект эскадры
			player.squadron[shipname] = {arrDecks, hits, x, y, kx, ky};
			if (player === human) {
				Ships.showShip(human, shipname, x, y, kx);
				// когда количество кораблей в эскадре достигнет 10, т.е. все корабли
				// сгенерированны, то можно показать кнопку запуска игры
				if (Object.keys(player.squadron).length == 10) {
					buttonPlay.hidden = false;
				}
			} else Ships.showShip(computer, shipname, x, y, kx);
		}
	}
    ///////////////////////////////////////////

    class NuclearBomb {
        constructor(field) {
            this.field = field;
            this.matrix = field.matrix;
		}

        static getCSSStyle(){
            return 'icon-field-nuclear-bomb';
        }

		createBomb(obj) {
		    let {x, y} = obj;
            this.matrix[x][y] = 5;
		}

    }
	///////////////////////////////////////////

    class Resurrection {
        constructor(field) {
            this.field = field;
            this.matrix = field.matrix;
		}

        static getCSSStyle(){
            return 'icon-field-resurrection';
        }

        createResurrection(obj) {
		    let {x, y} = obj;
            this.matrix[x][y] = 6;
		}

    }
	///////////////////////////////////////////
	class Controller {
		// массив базовых координат для формирования coordsFixedHit
		static START_POINTS = [
			[ [6,0], [2,0], [0,2], [0,6] ],
			[ [3,0], [7,0], [9,2], [9,6] ]
		];
		// Блок, в который выводятся информационные сообщения по ходу игры
		static SERVICE_TEXT = getElement('service_text');

		constructor() {
			this.player = '';
			this.opponent = '';
			this.text = '';
			// массив с координатами выстрелов при рандомном выборе
			this.coordsRandomHit = [];
			this.coordsRandomHit2 = [];
			// массив с заранее вычисленными координатами выстрелов
			this.coordsFixedHit = [];
			this.coordsFixedHit2 = [];
			// массив с координатами вокруг клетки с попаданием
			this.coordsAroundHit = [];
			this.coordsAroundHit2 = [];
            // список убитых кораблей
            this.listOfKilledShips = [];
			this.listOfKilledShips2 = [];
			// временный объект корабля, куда будем заносить координаты
			// попаданий, расположение корабля, количество попаданий
			this.resetTempShip();
			this.resetTempShip2();
		}

		// вывод информационных сообщений
		static showServiceText = (text, user) => {
		    const p = document.createElement('p');
		    p.innerHTML = text;
		    if(user == human){p.className = 'human_log';}
		    else p.className = 'computer_log';
            logs.appendChild(p);
		}

		// удаление ненужных координат из массива
		static removeElementArray = (arr, [x, y]) => {
			return arr.filter(item => item[0] != x || item[1] != y);
		}

		init() {
			// Рандомно выбираем игрока и его противника
			const random = Field.getRandom(1);
			this.player = (random == 0) ? human : computer;
			this.opponent = (this.player === human) ? computer : human;

			// генерируем координаты выстрелов компьютера и заносим их в
			// массивы coordsRandomHit и coordsFixedHit
			this.setCoordsShot();

			if (this.player === human) {
				compShot = false;
				this.text = 'Вы стреляете первым';
				setTimeout(() => this.makeShot(), SPEED);
				Controller.showServiceText(this.text, human);
			} else {
				compShot = true;
				this.text = 'Первым стреляет компьютер';
				// выстрел компьютера
				setTimeout(() => this.makeShot(), SPEED);
				Controller.showServiceText(this.text, computer);
			}
		}

		setCoordsShot() {
			// получаем координаты каждой клетки игрового поля
			// и записываем их в массив
			for (let i = 0; i < 10; i++) {
				for(let j = 0; j < 10; j++) {
					this.coordsRandomHit.push([i, j]);
					this.coordsRandomHit2.push([i, j]);
				}
			}
			// рандомно перемешиваем массив с координатами
			this.coordsRandomHit.sort((a, b) => Math.random() - 0.5);
            this.coordsRandomHit2.sort((a, b) => Math.random() - 0.5);
			let x, y;

			// получаем координаты для обстрела по диагонали вправо-вниз
			for (let arr of Controller.START_POINTS[0]) {
				x = arr[0]; y = arr[1];
				while (x <= 9 && y <= 9) {
					this.coordsFixedHit.push([x, y]);
					this.coordsFixedHit2.push([x, y]);
					x = (x <= 9) ? x : 9;
					y = (y <= 9) ? y : 9;
					x++; y++;
				}
			}

			// получаем координаты для обстрела по диагонали вправо-вверх
			for (let arr of Controller.START_POINTS[1]) {
				x = arr[0]; y = arr[1];
				while(x >= 0 && x <= 9 && y <= 9) {
					this.coordsFixedHit.push([x, y]);
					this.coordsFixedHit2.push([x, y]);
					x = (x >= 0 && x <= 9) ? x : (x < 0) ? 0 : 9;
					y = (y <= 9) ? y : 9;
					x--; y++;
				};
			}
			// изменим порядок следования элементов на обратный,
			// чтобы обстрел происходил в очерёдности согласно рисунка
			this.coordsFixedHit = this.coordsFixedHit.reverse();
//			this.coordsFixedHit2 = this.coordsFixedHit2.reverse();
		}

		setCoordsAroundHit(x, y, coords, user) {
		    if (user == human){
                let {firstHit, kx, ky} = this.tempShip2;

                // массив пустой, значит это первое попадание в данный корабль
                if (firstHit.length == 0) {
                    this.tempShip2.firstHit = [x, y];
                // второе попадание, т.к. оба коэффициента равны 0
                } else if (kx == 0 && ky == 0) {
                    // зная координаты первого и второго попадания,
                    // можно вычислить направление расположение корабля
                    this.tempShip2.kx = (Math.abs(firstHit[0] - x) == 1) ? 1 : 0;
                    this.tempShip2.ky = (Math.abs(firstHit[1] - y) == 1) ? 1 : 0;
                }

                // проверяем корректность полученных координат обстрела
                for (let coord of coords) {
                    x = coord[0]; y = coord[1];
                    // координаты за пределами игрового поля
                    if (x < 0 || x > 9 || y < 0 || y > 9) continue;
                    // по данным координатам установлен промах или маркер пустой клетки
                    if (computer.matrix[x][y] != 0 && computer.matrix[x][y] != 1) continue;
                    // валидные координаты добавляем в массив
                    this.coordsAroundHit2.push([x, y]);
                }
		    } else {
		        let {firstHit, kx, ky} = this.tempShip;

                // массив пустой, значит это первое попадание в данный корабль
                if (firstHit.length == 0) {
                    this.tempShip.firstHit = [x, y];
                // второе попадание, т.к. оба коэффициента равны 0
                } else if (kx == 0 && ky == 0) {
                    // зная координаты первого и второго попадания,
                    // можно вычислить направление расположение корабля
                    this.tempShip.kx = (Math.abs(firstHit[0] - x) == 1) ? 1 : 0;
                    this.tempShip.ky = (Math.abs(firstHit[1] - y) == 1) ? 1 : 0;
                }

                // проверяем корректность полученных координат обстрела
                for (let coord of coords) {
                    x = coord[0]; y = coord[1];
                    // координаты за пределами игрового поля
                    if (x < 0 || x > 9 || y < 0 || y > 9) continue;
                    // по данным координатам установлен промах или маркер пустой клетки
                    if (human.matrix[x][y] != 0 && human.matrix[x][y] != 1) continue;
                    // валидные координаты добавляем в массив
                    this.coordsAroundHit.push([x, y]);
                }
		    }
		}

		isShipSunk(user) {
		    if (user == computer){
                // max кол-во палуб у оставшихся кораблей
                let obj = Object.values(human.squadron)
                    .reduce((a, b) => a.arrDecks.length > b.arrDecks.length ? a : b);
                // определяем, есть ли ещё корабли, с кол-вом палуб больше, чем попаданий
                if (this.tempShip.hits >= obj.arrDecks.length || this.coordsAroundHit.length == 0) {
                    // корабль потоплен, отмечаем useless cell вокруг него
                    this.markUselessCellAroundShip(computer);
                    // очищаем массив coordsAroundHit и объект resetTempShip для
                    // обстрела следующего корабля
                    this.coordsAroundHit = [];
                    this.resetTempShip();
                }
			} else {
			    // max кол-во палуб у оставшихся кораблей
                let obj = Object.values(computer.squadron)
                    .reduce((a, b) => a.arrDecks.length > b.arrDecks.length ? a : b);
                // определяем, есть ли ещё корабли, с кол-вом палуб больше, чем попаданий
                if (this.tempShip2.hits >= obj.arrDecks.length || this.coordsAroundHit2.length == 0) {
                    // корабль потоплен, отмечаем useless cell вокруг него
                    this.markUselessCellAroundShip(human);
                    // очищаем массив coordsAroundHit и объект resetTempShip для
                    // обстрела следующего корабля
                    this.coordsAroundHit2 = [];
                    this.resetTempShip2();
                }
			}
		}


		// устанавливаем маркеры вокруг корабля при попадании
		markUselessCell(coords, user) {
			let n = 1, x, y;
            if (user == computer){
                for (let coord of coords) {
                    x = coord[0]; y = coord[1];
                    // координаты за пределами игрового поля
                    if (x < 0 || x > 9 || y < 0 || y > 9) continue;
                    // по этим координатам в матрице уже прописан промах или маркер пустой клетки
                    if (human.matrix[x][y] == 2 || human.matrix[x][y] == 3) continue;
                    // прописываем значение, соответствующее маркеру пустой клетки
                    human.matrix[x][y] = 2;
                    // вывоим маркеры пустых клеток по полученным координатам
                    // для того, чтобы маркеры выводились поочерёдно, при каждой итерации
                    // увеличиваем задержку перед выводом маркера
                    setTimeout(() => this.showIcons(human, coord, 'shaded-cell'), 0);
                    // удаляем полученные координаты из всех массивов
                    this.removeCoordsFromArrays(coord, computer);
                    n++;
                }
            }   else{
                    for (let coord of coords) {
                        x = coord[0]; y = coord[1];
                        // координаты за пределами игрового поля
                        if (x < 0 || x > 9 || y < 0 || y > 9) continue;
                        // по этим координатам в матрице уже прописан промах или маркер пустой клетки
                        if (computer.matrix[x][y] == 2 || computer.matrix[x][y] == 3) continue;
                        // прописываем значение, соответствующее маркеру пустой клетки
                        computer.matrix[x][y] = 2;
                        // вывоим маркеры пустых клеток по полученным координатам
                        // для того, чтобы маркеры выводились поочерёдно, при каждой итерации
                        // увеличиваем задержку перед выводом маркера
                        setTimeout(() => this.showIcons(computer, coord, 'shaded-cell'), 0);
                        // удаляем полученные координаты из всех массивов
                        this.removeCoordsFromArrays(coord, human);
                        n++;
                    }
                }
			}

		removeCoordsFromArrays(coords, user) {
//		   console.log(coords, user);
		    if (user == human) {
                if (this.coordsAroundHit2.length > 0) {
                    this.coordsAroundHit2 = Controller.removeElementArray(this.coordsAroundHit2, coords);
                }
                if (this.coordsFixedHit2.length > 0) {
                    this.coordsFixedHit2 = Controller.removeElementArray(this.coordsFixedHit2, coords);
                }
                this.coordsRandomHit2 = Controller.removeElementArray(this.coordsRandomHit2, coords);
            } else {
                if (this.coordsAroundHit.length > 0) {
                    this.coordsAroundHit = Controller.removeElementArray(this.coordsAroundHit, coords);
                }
                if (this.coordsFixedHit.length > 0) {
                    this.coordsFixedHit = Controller.removeElementArray(this.coordsFixedHit, coords);
                }
                this.coordsRandomHit = Controller.removeElementArray(this.coordsRandomHit, coords);
            }
		}

		// устанавливаем маркеры после уничтожения корабля
		markUselessCellAroundShip(user){
		    if (user == human){
                // присваиваем переменным соответствующие значения из объекта tempShip
                const {hits, kx, ky, x0, y0} = this.tempShip2;
                let coords;

                // рассчитываем координаты пустых клеток
                // однопалубный корабль
                if (this.tempShip2.hits == 1) {
                    coords = [
                        // верхняя
                        [x0 - 1, y0],
                        // нижняя
                        [x0 + 1, y0],
                        // левая
                        [x0, y0 - 1],
                        // правая
                        [x0, y0 + 1]
                    ];
                // многопалубный корабль
                } else {
                    coords = [
                        // левая / верхняя
                        [x0 - kx, y0 - ky],
                        // правая / нижняя
                        [x0 + kx * hits, y0 + ky * hits]
                    ];
                }
                this.markUselessCell(coords, human);
			} else {
			    // присваиваем переменным соответствующие значения из объекта tempShip
                const {hits, kx, ky, x0, y0} = this.tempShip;
                let coords;

                // рассчитываем координаты пустых клеток
                // однопалубный корабль
                if (this.tempShip.hits == 1) {
                    coords = [
                        // верхняя
                        [x0 - 1, y0],
                        // нижняя
                        [x0 + 1, y0],
                        // левая
                        [x0, y0 - 1],
                        // правая
                        [x0, y0 + 1]
                    ];
                // многопалубный корабль
                } else {
                    coords = [
                        // левая / верхняя
                        [x0 - kx, y0 - ky],
                        // правая / нижняя
                        [x0 + kx * hits, y0 + ky * hits]
                    ];
                }
                this.markUselessCell(coords, computer);
			}
		}

		showIcons(opponent, [x, y], iconClass) {
			// экземпляр игрового поля на котором будет размещена иконка
			const field = opponent.field;
			// небольшая задержка при формировании иконок промаха и попадания
			if (iconClass === 'dot' || iconClass === 'red-cross' || iconClass === 'icon-field-nuclear-bomb') {
				setTimeout(() => fn(), 0);
			} else {
			    fn();
			}
			function fn() {
				// создание элемента и добавление ему класса и стилей
				const span = document.createElement('span');
				span.id = `${x*Field.SHIP_SIDE}${y*Field.SHIP_SIDE}`;
				span.className = `icon-field ${iconClass}`;
				span.style.cssText = `left:${y * Field.SHIP_SIDE}px; top:${x * Field.SHIP_SIDE}px;`;
				// размещаем иконку на игровом поле
				field.appendChild(span);
			}
		}

		showExplosion(x, y) {
			this.showIcons(this.opponent, [x, y], 'explosion');
			const explosion = this.opponent.field.querySelector('.explosion');
			explosion.classList.add('active');
			setTimeout(() => explosion.remove(), 0);
		}

		getCoordsForShot(user) {
		    if(user == human){
                const coords = (this.coordsAroundHit2.length > 0) ? this.coordsAroundHit2.pop() : (this.coordsFixedHit2.length > 0) ? this.coordsFixedHit2.pop() : this.coordsRandomHit2.pop();
                // удаляем полученные координаты из всех массивов
                this.removeCoordsFromArrays(coords, human);
                return coords;
			} else {
			    const coords = (this.coordsAroundHit.length > 0) ? this.coordsAroundHit.pop() : (this.coordsFixedHit.length > 0) ? this.coordsFixedHit.pop() : this.coordsRandomHit.pop();
                // удаляем полученные координаты из всех массивов
                this.removeCoordsFromArrays(coords, computer);
                return coords;
			}

		}

		resetTempShip() {
			this.tempShip = {
				hits: 0,
				firstHit: [],
				kx: 0,
				ky: 0
			};
		}
        resetTempShip2() {
			this.tempShip2 = {
				hits: 0,
				firstHit: [],
				kx: 0,
				ky: 0
			};
		}
		makeShot() {
			let x, y;
			if (!compShot) {
                ([x, y] = this.getCoordsForShot(human));
			} else {
				([x, y] = this.getCoordsForShot(computer));
			}

			// показываем и удаляем иконку выстрела
			this.showExplosion(x, y);

			const v	= this.opponent.matrix[x][y];
			switch(v) {
				case 0: // промах
					this.miss(x, y);
					break;
				case 1: // попадание
					this.hit(x, y);
					break;

				case 3: // повторный обстрел
				case 4:
					setTimeout(() => this.makeShot(), SPEED);
					break;
				case 5:
				    let text = '';
				    this.showIcons(this.opponent, [x, y],  NuclearBomb.getCSSStyle());
                    if(this.opponent == human){
                        text = 'Компьютер взорвал ядерную бомбу. Вы проиграли!';
                        setTimeout(() => Controller.showServiceText(text, computer), 400);
                        setTimeout(() => alert(text), 420);
                    }
                    else {
                        text = 'Вы взорвали ядерную бомбу. Вы выиграли!';
                        setTimeout(() => Controller.showServiceText(text, human), 400);
                        setTimeout(() => alert(text), 420);
                    }
				    buttonNewGame.hidden = false;
				    return;
				case 6:
				    if(this.opponent == human) setTimeout(() => Controller.showServiceText('Компьютер активировал воскрешение своего корабля!', computer), 0);
                    else setTimeout(() => Controller.showServiceText('Вы активировал воскрешение своего корабля!', human), 0);
				    this.health(x, y);
				    break;
			}
		}

        health(x, y){
            this.showIcons(this.opponent, [x, y], Resurrection.getCSSStyle());
            if(this.opponent == human) {
                if (this.listOfKilledShips2.length){
                    this.listOfKilledShips2[0][1].hits = 0;
                    this.player.squadron[this.listOfKilledShips2[0][0]] = this.listOfKilledShips2[0][1];
                    for(let i = 0; i < this.listOfKilledShips2[0][1].arrDecks.length; i++){
                       let coords = this.listOfKilledShips2[0][1].arrDecks;
                       let string_id = `${coords[i][0]*Field.SHIP_SIDE}${coords[i][1]*Field.SHIP_SIDE}`;
                       let elem = document.getElementById((string_id));
                       elem.classList.remove('red-cross');
                       computer.matrix[coords[i][0]][coords[i][1]] = 1;
                       this.coordsRandomHit2.push([coords[i][0], coords[i][1]]);
                       this.coordsRandomHit2.sort((a, b) => Math.random() - 0.5);
                    }
                    this.listOfKilledShips2.shift();
                }
            } else {
                if (this.listOfKilledShips.length){
                    this.listOfKilledShips[0][1].hits = 0;
                    this.player.squadron[this.listOfKilledShips[0][0]] = this.listOfKilledShips[0][1];
                    for(let i = 0; i < this.listOfKilledShips[0][1].arrDecks.length; i++){
                       let coords = this.listOfKilledShips[0][1].arrDecks;
                       let string_id = `${coords[i][0]*Field.SHIP_SIDE}${coords[i][1]*Field.SHIP_SIDE}`;
                       let elem = document.getElementById((string_id));
                       elem.classList.remove('red-cross');
                       human.matrix[coords[i][0]][coords[i][1]] = 1;
                       this.coordsRandomHit.push([coords[i][0], coords[i][1]]);
                       this.coordsRandomHit.sort((a, b) => Math.random() - 0.5);
                    }
                    this.listOfKilledShips.shift();
                }
            }
            setTimeout(() => this.makeShot(), SPEED);
        }

		miss(x, y) {
			let text = '';
			// устанавливаем иконку промаха и записываем промах в матрицу
			this.showIcons(this.opponent, [x, y], 'dot');
			this.opponent.matrix[x][y] = 3;

			// определяем статус игроков
			if (this.player === human) {
				text = 'Вы промахнулись. Стреляет компьютер.';
				setTimeout(() => Controller.showServiceText(text, computer), 30);
				if (this.coordsAroundHit2.length == 0 && this.tempShip2.hits > 0) {
					// корабль потоплен, отмечаем useless cell вокруг него
					this.markUselessCellAroundShip(human);
					this.resetTempShip2();
				}
				this.player = computer;
				this.opponent = human;
				compShot = true;
				setTimeout(() => this.makeShot(), SPEED);
			} else {
				text = 'Компьютер промахнулся. Ваш выстрел.';
                setTimeout(() => Controller.showServiceText(text, human), 30);
				// обстреляны все возможные клетки для данного корабля
				if (this.coordsAroundHit.length == 0 && this.tempShip.hits > 0) {
					// корабль потоплен, отмечаем useless cell вокруг него
					this.markUselessCellAroundShip(computer);
					this.resetTempShip();
				}
				this.player = human;
				this.opponent = computer;
				compShot = false;
				setTimeout(() => this.makeShot(), SPEED);
			}
		}

		hit(x, y) {
			let text = '';
			// устанавливаем иконку попадания и записываем попадание в матрицу
			this.showIcons(this.opponent, [x, y], 'red-cross');
			this.opponent.matrix[x][y] = 4;
			// выводим текст, зависящий от стреляющего
			text = (this.player === human) ? ('Поздравляем! Вы попали. Ваш выстрел.'): ('Компьютер попал в ваш корабль. Выстрел компьютера');
            setTimeout(() => Controller.showServiceText(text, this.player), 0);
			// перебираем корабли эскадры противника
			outerloop:
			for (let name in this.opponent.squadron) {
				const dataShip = this.opponent.squadron[name];
				for (let value of dataShip.arrDecks) {
					// перебираем координаты палуб и сравниваем с координатами попадания
					// если координаты не совпадают, переходим к следующей итерации
					if (value[0] != x || value[1] != y) continue;
					dataShip.hits++;
					if (dataShip.hits < dataShip.arrDecks.length) break outerloop;
					// код для выстрела компьютера: сохраняем координаты первой палубы
					if (this.opponent === human) {
						this.tempShip.x0 = dataShip.x;
						this.tempShip.y0 = dataShip.y;
					} else {
					    this.tempShip2.x0 = dataShip.x;
						this.tempShip2.y0 = dataShip.y;
					}
					if(this.opponent == computer) {
                        this.listOfKilledShips2.push([name, this.opponent.squadron[name]]);
					}
					else {
                        this.listOfKilledShips.push([name, this.opponent.squadron[name]]);
				    }
					// если количество попаданий в корабль равно количеству палуб,
					// удаляем данный корабль из массива эскадры
					delete this.opponent.squadron[name];
					break outerloop;
				}
			}

			// все корабли эскадры уничтожены
			if (Object.keys(this.opponent.squadron).length == 0) {
				if (this.opponent === human) {
					text = 'К сожалению, вы проиграли.';
					// показываем оставшиеся корабли компьютера
					for (let name in computer.squadron) {
						const dataShip = computer.squadron[name];
						Ships.showShip(computer, name, dataShip.x, dataShip.y, dataShip.kx );
					}
				} else {
					text = 'Поздравляем! Вы выиграли!';
				}
				alert(text);
				setTimeout(() => Controller.showServiceText(text, this.player), 50);
				// показываем кнопку продолжения игры
				buttonNewGame.hidden = false;
			// бой продолжается
			} else if (this.opponent === human) {
				let coords;
				this.tempShip.hits++;

				// отмечаем клетки по диагонали, где точно не может стоять корабль
				coords = [
					[x - 1, y - 1],
					[x - 1, y + 1],
					[x + 1, y - 1],
					[x + 1, y + 1]
				];
				this.markUselessCell(coords, computer);

				// формируем координаты обстрела вокруг попадания
				coords = [
					[x - 1, y],
					[x + 1, y],
					[x, y - 1],
					[x, y + 1]
				];
				this.setCoordsAroundHit(x, y, coords, computer);

				// проверяем, потоплен ли корабль, в который было попадание
				this.isShipSunk(computer);

				// после небольшой задержки, компьютер делает новый выстрел
				setTimeout(() => this.makeShot(), SPEED);
			} else {
			    let coords;
				this.tempShip2.hits++;

				// отмечаем клетки по диагонали, где точно не может стоять корабль
				coords = [
					[x - 1, y - 1],
					[x - 1, y + 1],
					[x + 1, y - 1],
					[x + 1, y + 1]
				];
				this.markUselessCell(coords, human);

				// формируем координаты обстрела вокруг попадания
				coords = [
					[x - 1, y],
					[x + 1, y],
					[x, y - 1],
					[x, y + 1]
				];
				this.setCoordsAroundHit(x, y, coords, human);

				// проверяем, потоплен ли корабль, в который было попадание
				this.isShipSunk(human);
			    setTimeout(() => this.makeShot(), SPEED);
			}
		}
	}

	///////////////////////////////////////////

	// родительский контейнер с инструкцией
	const instruction = getElement('instruction');
	// контейнер с заголовком
	const toptext = getElement('text_top');
	// кнопка начала игры
	const buttonPlay = getElement('play');
	// кнопка перезапуска игры
	const buttonNewGame = getElement('newgame');

	// получаем экземпляр игрового поля игрока
	const human = new Field(humanfield);
	// экземпляр игрового поля только регистрируем
	let computer = {};

	let control = null;

	getElement('type_placement').addEventListener('click', function(e) {
		// используем делегирование основанное на всплытии событий
		if (e.target.tagName != 'SPAN') return;

		// если мы уже создали эскадру ранее, то видна кнопка начала игры
		// скроем её на время повторной расстановки кораблей
		buttonPlay.hidden = true;
		// очищаем игровое поле игрока перед повторной расстановкой кораблей
		human.cleanField();

		// очищаем клон объекта с набором кораблей
		let initialShipsClone = '';
		// способ расстановки кораблей на игровом поле
		const type = e.target.dataset.target;
		// создаём литеральный объект typeGeneration
		// каждому свойству литерального объекта соответствует функция
		// в которой вызывается рандомная или ручная расстановка кораблей
		const typeGeneration = {
			random() {
				// скрываем контейнер с кораблями, предназначенными для перетаскивания
				// на игровое поле

				// вызов ф-ии рандомно расставляющей корабли для экземпляра игрока
				human.randomLocationShips();
				human.randomNuclearBomb();
                human.randomResurrection();
			}
		};
		// вызов функции литерального объекта в зависимости
		// от способа расстановки кораблей
		typeGeneration[type]();

		// создаём экземпляр класса, отвечающего за перетаскивание
		// и редактирование положения кораблей
//		const placement = new Placement();
		// устанавливаем обработчики событий
//		placement.setObserver();
	});

	buttonPlay.addEventListener('click', function(e) {
		// скрываем не нужные для игры элементы
		buttonPlay.hidden = true;
		instruction.hidden = true;
		// показываем игровое поле компьютера
		computerfield.parentElement.hidden = false;
		toptext.innerHTML = 'Морской бой между эскадрами';

		// создаём экземпляр игрового поля компьютера
		computer = new Field(computerfield);
		// очищаем поле от ранее установленных кораблей
		computer.cleanField();
		computer.randomLocationShips();
		computer.randomNuclearBomb();
		computer.randomResurrection();
		// устанавливаем флаг запуска игры
		startGame = true;

		// создаём экземпляр контроллера, управляющего игрой
		if (!control) control = new Controller();
		// запускаем игру
		control.init();
	});

	buttonNewGame.addEventListener('click', function(e) {
		// скрываем кнопку перезапуска игры
		buttonNewGame.hidden = true;
		// скрываем игровое поле компьютера
		computerfield.parentElement.hidden = true;
		// показываем управляющие элементы выбора способа
		// расстановки кораблей
		instruction.hidden = false;
		// очищаем поле игрока
		human.cleanField();
		toptext.innerHTML = 'Расстановка кораблей';
		Controller.SERVICE_TEXT.innerHTML = '';

		// устанавливаем флаги в исходное состояние
		startGame = false;
		compShot = false;

		// обнуляем массивы с координатами выстрела
		control.coordsRandomHit = [];
		control.coordsRandomHit2 = [];
		control.coordsFixedHit = [];
		control.coordsFixedHit2 = [];
		control.coordsAroundHit = [];
		control.coordsAroundHit2 = [];
		control.listOfKilledShips = [];
		control.listOfKilledShips2 = [];
		// сбрасываем значения объекта tempShip
		control.resetTempShip();
		control.resetTempShip2();
	});

	/////////////////////////////////////////////////

	function printMatrix() {
		let print = '';
		for (let x = 0; x < 10; x++) {
			for (let y = 0; y < 10; y++) {
				print += human.matrix[x][y];
				print += computer.matrix[x][y];
			}
			print += '<br>';
		}
		getElement('matrix').innerHTML = print;
	}
})();
