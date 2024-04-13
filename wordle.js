var players = [];
var games = [];
const LOG = true;
class Game{
	constructor(client){
		this.players = [client];
		this.name = client.name;
		client.game = this;
		this.state = 0;
		this.rotation = -1;
		this.words = [];
		this.waiting = 0;
		games.push(this);
		if(LOG) console.log(client.name+' created a game');
		// sendOpenGames();
		this.updateInGamePlayers();
	}
	add(client){
		this.players.push(client);
		client.game = this;
		this.updateInGamePlayers();
	}
	remove(client){
		let ix = this.players.indexOf(client);
		if(ix!=-1) this.players.splice(ix,1);
		this.updateInGamePlayers('w-removed');
		if(LOG) console.log('Player disconnected. Players left: '+this.players.length)
		if(this.players.length==0){
			this.exit();
		}
	}
	updateInGamePlayers(type='w-joined'){
		sendAll(this.players,type,this.players.map(e=>e.name));
		this.players[0]?.emit('w-start-req');
	}
	exit(){
		for(let p of this.players){
			p.game = null;
			p.emit('w-disconnect');
		}
		let ix = games.indexOf(this);
		if(ix!=-1) games.splice(ix,1);
		if(LOG) console.log('Game auto removed');
	}
	start(){
		this.players.sort(()=>Math.random()-.5);
		this.chooseNext();
		for(let p of this.players){
			p.stats = [];
		}
	}
	chooseNext(){
		let r = ++this.rotation;
		if(r == this.players.length){
			// throw new Error('TODO: Add Game Completion');
			this.exit();
		} else {
			this.players[r].emit('w-choose');
			this.msgAll(this.players[r].name+' is choosing a word.');	
		}
		this.waiting = this.players.length - 1;
	}
	useWord(word){
		for(let i=0;i<this.players.length;i++){
			if(this.rotation != i){
				this.words.push(word);
				this.players[i].emit('w-setword',word);
			} else {
				this.players[i].stats.push({win:0,guess:0,seconds:0})
			}
		}
		this.msgAll('Word selected');
	}
	playerFinished(player){
		this.waiting--;
		this.msgAll(player.name+' got the word. Players remaining: '+this.waiting);
		if(this.waiting == 0){
			sendAll(this.players,'w-stats');
			if(LOG) console.log('Turn Over');
			this.calculateStats();
			this.state = 1;
		}
	}
	msgAll(msg){
		sendAll(this.players,'w-message',msg);
	}
	calculateStats(){
		let stats = [];
		for(let p of this.players){
			let obj = {
				name: p.name,
				last_time: 0,
				total_time: 0,
				last_guess: 0,
				total_guess: 0,
				wins: 0
			};
			for(let stat of p.stats){
				obj.last_time = stat.seconds;
				obj.total_time += stat.seconds;
				obj.last_guess = stat.guess;
				obj.total_guess += stat.guess;
				obj.wins++;
			}
			stats.push(obj);
		}
		sendAll(this.players,'w-leaderstat',stats);
		setTimeout(_=>{this.chooseNext()},5000);
	}
}

function sendAll(arr_of_clients,msg,value){
	for(let c of arr_of_clients){
		c.emit(msg,value);
	}
}

function sendOpenGames(c){
	let openGames = games.filter(e=>e.state==0).map(e=>e.name);
	if(!c) sendAll(players,'w-games',openGames);
	else c.emit('w-games',openGames);
}

function join(client){
	players.push(client);
	setupEvents(client);
	sendOpenGames(client);
}

function remove(client){
	let ix = players.indexOf(client);
	if(ix!=-1){
		if(client.game){
			client.game.remove(client);
		}
		players.splice(ix,1);
		if(LOG) console.log(client.name+' disconnected');
	}
}

function setupEvents(c){
	c.socket.on('w-newgame',e=>{
		new Game(c);
	});
	c.socket.on('w-name',name=>{
		c.name = name;
		sendOpenGames(c);
	});
	c.socket.on('w-join-game',name=>{
		let opts = games.filter(e=>e.name == name);
		if(opts[0]){
			opts[0].add(c);
		} else {
			sendOpenGames(c);
		}
	});
	c.socket.on('w-start',_=>{
		c.game.start();
	});
	c.socket.on('w-chose-word',word=>{
		c.game.useWord(word);
	});
	c.socket.on('w-report',data=>{
		c.stats.push(data);
		c.game.playerFinished(c);
		if(LOG) console.log(data);
	});
}



exports.join = join;
exports.remove = remove;