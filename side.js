

let gl = null
let canvas = null
const rasterizer = { program: null, locations: null }
const textures = new Map()

let level = null
let data = null
let pos_buffer = null
let tex_buffer = null

let draw_configurations = []

const STATE = {
	NONE:		0,
	IDLE:		1,
	MOVE:		2,
	JUMP:		4,
	FALL:		8,
	ROLL:		16,
	ATTACK1:	32,
	ATTACK2:	64,
	ATTACK3:	128
}
const JUMP_DURATION = 22 * 83 / 2
let JUMP_HEIGHT = 0


const ROLL_DURATION = 8 * 83

const PLAYER_SCALE = 3
const PIXEL_TRIM = 1

const animation_idle_dtime = 83

let jump_floor = 384

let input = {
	left: false,
	right: false,
	up: false,
	down: false,
	jump: false,
	roll: false,
	attack1: false,
	attack2: false,
	attack3: false
}

const player = {
	x: 220,
	y: 384,
	state: STATE.IDLE,
	special: "",
	going_up: true,
	sprites: null,
	jump_reset: false,
	animations: null,
	pos_buffer: 0,
	tex_buffer: 0,
	geometry: null
}
let animation_start_time = 0

const scale = 1

init()


async function init() {

	canvas = document.getElementById("display")
	gl = canvas.getContext("webgl2")
	canvas.addEventListener("contextmenu", canvas_on_context)	
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

	// gl.enable(gl.DEPTH_TEST)

	console.log(gl.getParameter(gl.VERSION))
	console.log(gl.getParameter(gl.SHADING_LANGUAGE_VERSION))

	// const extensions = gl.getSupportedExtensions()
	// console.log(extensions)
		
	const vert_shader_source = await shader_fetch("shader.vert")
	const frag_shader_source = await shader_fetch("shader.frag")
	
	rasterizer.program = shader_program_create(gl, vert_shader_source, frag_shader_source)
	rasterizer.locations = shader_program_get_parameters(gl, rasterizer.program)

	level = await tiled_fetch("resources/side/level-village.json")
	data = level_generate_geometry(level)

	pos_buffer = gl.createBuffer()
	tex_buffer = gl.createBuffer()

	gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW)
	gl.bindBuffer(gl.ARRAY_BUFFER, tex_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.texcoords), gl.STATIC_DRAW)

	// to fix
	player.pos_buffer = gl.createBuffer()
	player.tex_buffer = gl.createBuffer()
	
	player.animations = await aseprite_fetch("resources/side/elf.json")		//loaded as a script src in the HTML (index.html)
	const texture = textures.get(player.animations.meta.image)
	player.sprites = texture.image
	player.texture = texture.id

	animation_start_time = Date.now()
	JUMP_HEIGHT = level.tileheight * 3.5

	window.addEventListener("keydown", window_on_keydown)
	window.addEventListener("keyup", window_on_keyup)
	window.addEventListener("mousedown", window_on_mousedown)
	window.addEventListener("mouseup", window_on_mouseup)
	// window.addEventListener("contextmenu", canvas_on_context)	

	window.requestAnimationFrame(loop)
}


async function tiled_fetch(url) {

	let response = await fetch(url);
	const level = await response.json();

	for(const ts of level.tilesets) {

		const source = ts.image
		const image = await image_load("resources/side/" + source)
		const id = texture_create(image)
		textures.set(source, { source: source, image: image, id: id })
	}

	for(const layer of level.layers) {
		if(layer.type === "imagelayer") {
			const source = layer.image
			const image = await image_load("resources/side/" + source)
			const id = texture_create(image)
			textures.set(source, { source: source, image: image, id: id })
		}
	}

	return level
}


async function aseprite_fetch(url) {

	let response = await fetch(url);
	const sprite = await response.json();

	const source = sprite.meta.image
	const image = await image_load("resources/side/" + source)
	const id = texture_create(image)
	textures.set(source, { source: source, image: image, id: id })

	return sprite
}


function level_generate_geometry(level) {

	const positions = []
	const texcoords = []
	let i = 0

	const positions_by_set = new Array(level.tilesets.length)
	const texcoords_by_set = new Array(level.tilesets.length)
	for(let i=0; i<positions_by_set.length; i++) {
		positions_by_set[i] = []
		texcoords_by_set[i] = []
	}

	for(let i=0; i<level.layers.length; i++) {

		if(level.layers[i].name === "collision") continue

		const layer = level.layers[i]
		const z = (level.layers.length - i) / level.layers.length

		console.log(`layer num:${i} z:${z}`)

		if(layer.type === "imagelayer") {

			const tex = textures.get(layer.image)
			draw_configurations.push({ texture: tex.id, offset: positions.length, length: 18 })
			const iw = tex.image.width / scale
			const ih = tex.image.height / scale

			positions.push(
				layer.x, 	layer.y,	z,
				layer.x, 	layer.y+ih,	z,
				layer.x+iw,	layer.y+ih,	z,
				layer.x+iw,	layer.y+ih,	z,
				layer.x+iw,	layer.y,	z,
				layer.x, 	layer.y,	z	
			)

			texcoords.push(
				0, 0,
				0, 1,
				1, 1,
				1, 1,
				1, 0,
				0, 0
			)
		}
		else if(layer.type === "tilelayer") {

			const th = level.tileheight / scale
			const tw = level.tilewidth / scale

			for(let i=0; i<layer.data.length; i++) {

				let tile = layer.data[i]
				if(tile === 0) continue

				// find positions_by_set index
				let tsi
				for(tsi=0; tsi<level.tilesets.length; tsi++) {
					if(tile < level.tilesets[tsi].firstgid) {
						break;
					}
				}
				tsi--

				// generate geometry
				const col = i % level.width
				const row = Math.floor(i / level.width)
				const x = col * tw
				const y = row * th

				positions_by_set[tsi].push(
					x,		y,		z,
					x,		y+th,	z,
					x+tw,	y+th,	z,
					x+tw,	y+th,	z,
					x+tw,	y,		z,
					x,		y,		z
				)

				tile = tile - level.tilesets[tsi].firstgid 
				const u  = (tile % level.tilesets[tsi].columns) / level.tilesets[tsi].columns
				const v  = Math.floor(tile / level.tilesets[tsi].columns) / (level.tilesets[tsi].imageheight / level.tilesets[tsi].tileheight)
				const s = level.tilesets[tsi].tilewidth / level.tilesets[tsi].imagewidth
				const t = level.tilesets[tsi].tileheight / level.tilesets[tsi].imageheight

				texcoords_by_set[tsi].push(
					u,		v,
					u, 		v+t,
					u+s,	v+t,
					u+s,	v+t,
					u+s,	v,
					u, 		v
				)
			}
			// no depth test
			for(let tsi=0; tsi<positions_by_set.length; tsi++) {

				const xys = positions_by_set[tsi]
				const uvs = texcoords_by_set[tsi]
				const tex = textures.get(level.tilesets[tsi].image)
				draw_configurations.push({ texture: tex.id, offset: positions.length, length: xys.length })
				// copy tiles to positions
				for(let i=0; i<xys.length; i++) {
					positions.push(xys[i])
				}
				for(let i=0; i<uvs.length; i++) {
					texcoords.push(uvs[i])
				}
			}
			
			for(let i=0; i<positions_by_set.length; i++) {
				positions_by_set[i] = []
				texcoords_by_set[i] = []
			}
		}
	}

	// only works witth depth test
	// add positions_by_set configurations
	// for(let tsi=0; tsi<positions_by_set.length; tsi++) {

	// 	const xys = positions_by_set[tsi]
	// 	const uvs = texcoords_by_set[tsi]
	// 	const tex = textures.get(level.tilesets[tsi].image)
	// 	draw_configurations.push({ texture: tex.id, offset: positions.length, length: xys.length })
	// 	// copy tiles to positions
	// 	for(let i=0; i<xys.length; i++) {
	// 		positions.push(xys[i])
	// 	}
	// 	for(let i=0; i<uvs.length; i++) {
	// 		texcoords.push(uvs[i])
	// 	}
	// }


	return { positions: positions, texcoords: texcoords }
}


function player_generate_geometry(player_frame) {

	const positions = [
		player.x - (player_frame.w * PLAYER_SCALE / 2),	player.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE,	0,
		player.x - (player_frame.w * PLAYER_SCALE / 2),	player.y,													0,
		player.x + (player_frame.w * PLAYER_SCALE / 2),	player.y,													0,

		player.x + (player_frame.w * PLAYER_SCALE / 2),	player.y,													0,
		player.x + (player_frame.w * PLAYER_SCALE / 2),	player.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE,	0,
		player.x - (player_frame.w * PLAYER_SCALE / 2),	player.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE,	0,
	]
	
	const u = player_frame.x / player.sprites.width
	const v = player_frame.y / player.sprites.height
	const s = player_frame.w / player.sprites.width
	const t = player_frame.h / player.sprites.height

	let texcoords = [
		u,		v,
		u, 		v+t,
		u+s,	v+t,
		u+s,	v+t,
		u+s,	v,
		u, 		v
	]

	if(player.special === "reversed") {
		texcoords = [
			u+s,	v,
			u+s,	v+t,
			u,		v+t,
			u,		v+t,
			u,		v,
			u+s, 	v
		]
	}

	return { positions: positions, texcoords: texcoords }
}


function loop(timestamp) {

	// process key down/up and mouse down/up and set player.state
	process_input();
	// debug_state(player.state);

	// update player position, detect collision, etc
	// this has to be done before calculation animation frame
	// in case this changes the player.state
	// check fall
	let collision_tiles = null
	for(const layer of level.layers) {
		if(layer.name === "collision") {
			collision_tiles = layer.data
			break
		}
	}

	if(player.state & STATE.JUMP) {

		const y = calc_jump(animation_start_time, JUMP_HEIGHT, JUMP_DURATION)
		let current_dy = player.y;
		let new_dy = jump_floor - y;
		player.y = jump_floor - y

		if (current_dy < new_dy) {
			player.going_up = false;
			console.log("going down")
		}
		else {
			player.going_up = true;
			console.log("going up")
		}

		let tile_index = calc_tile_index(player.x, player.y + level.tileheight/2, level.tilewidth, level.tileheight, level.width);
		// let tiles = level.layers[0].data;

		if (collision_tiles[tile_index] !== 0 && player.going_up === false) {
			player.y = Math.floor(tile_index / level.width) * level.tileheight;
			jump_floor = player.y
			player.state = player.state ^ STATE.JUMP;
			player.going_up = true;
		}
	}
	if(player.state & STATE.ROLL) {

		if(Date.now() - animation_start_time < ROLL_DURATION) {
			if (player.special === "reversed") {
				player.x = player.x - 3
			}
			else {
				player.x = player.x + 3
			}		
		}
		else {
			player.state = player.state ^ STATE.ROLL;
		}
	}
	else if(player.state & STATE.MOVE) {
		if (player.special === "reversed") {
			player.x = player.x - 3
		}
		else {
			player.x = player.x + 3
		}
	}

	if(collision_tiles !== null) {
		let tile_index = calc_tile_index(player.x, player.y + 1, level.tilewidth, level.tileheight, level.width);
		if ( (typeof collision_tiles[tile_index] === "undefined" || collision_tiles[tile_index] === 0) && !(player.state & STATE.JUMP)) {
			if(!(player.state & STATE.FALL)) {
				player.state = player.state | STATE.FALL;
				animation_start_time = Date.now()
			}
		}
		
		if(player.state & STATE.FALL) {
	
			player.y = player.y + 6;
	
			let tile_index = calc_tile_index(player.x, player.y, level.tilewidth, level.tileheight, level.width);
			if (typeof collision_tiles[tile_index] !== "undefined" && collision_tiles[tile_index] !== 0) {
				if(player.state & STATE.FALL) {
					player.state = player.state ^ STATE.FALL;
					player.y = Math.floor(player.y / level.tileheight) * level.tileheight
					jump_floor = player.y
				}
			}
		}
	}


	// figure out which frame to draw
	const player_frame = calc_player_animation()
	player.geometry = player_generate_geometry(player_frame)

	draw()

	window.requestAnimationFrame(loop)
}


function draw() {

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)		// clear screen

	gl.useProgram(rasterizer.program)

	gl.uniform2f(rasterizer.locations.u_screensize.location, canvas.width, canvas.height)

	gl.activeTexture(gl.TEXTURE0)
	gl.uniform1i(rasterizer.locations.u_texture.location, 0)

	gl.uniform2f(rasterizer.locations.u_displacement.location, 0, 0)


	gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer)
	// gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_position.location)
	gl.vertexAttribPointer(rasterizer.locations.a_position.location, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, tex_buffer)
	// gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.texcoords), gl.STATIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_texcoord.location)
	gl.vertexAttribPointer(rasterizer.locations.a_texcoord.location, 2, gl.FLOAT, false, 0, 0)

	for(const conf of draw_configurations) {
		gl.bindTexture(gl.TEXTURE_2D, conf.texture)
		gl.drawArrays(gl.TRIANGLES, conf.offset/3, conf.length/3)		// run our program by drawing points (one for now)
	}


	// draw player
	gl.bindBuffer(gl.ARRAY_BUFFER, player.pos_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(player.geometry.positions), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_position.location)
	gl.vertexAttribPointer(rasterizer.locations.a_position.location, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, player.tex_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(player.geometry.texcoords), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_texcoord.location)
	gl.vertexAttribPointer(rasterizer.locations.a_texcoord.location, 2, gl.FLOAT, false, 0, 0)

	const texture_id = textures.get("elf.png").id
	gl.bindTexture(gl.TEXTURE_2D, texture_id)
	gl.drawArrays(gl.TRIANGLES, 0, 6)

	gl.flush()
}


function texture_create(image) {

	const texture = gl.createTexture()
	// gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

	return texture
}


function image_load(url) {

	return new Promise(resolve => {
		const image = new Image()
		image.addEventListener('load', () => resolve(image))
		image.src = url
	});
}


function shader_program_create(gl, vert_shader_source, frag_shader_source) {

	const vertex_shader = gl.createShader(gl.VERTEX_SHADER)
	gl.shaderSource(vertex_shader, vert_shader_source)
	gl.compileShader(vertex_shader)

	let status = gl.getShaderParameter(vertex_shader, gl.COMPILE_STATUS)
	if (!status) {
		console.error(`Couldn't compile vertex shader!\n${gl.getShaderInfoLog(vertex_shader)}`)
		return null
	}

	const fragment_shader = gl.createShader(gl.FRAGMENT_SHADER)
	gl.shaderSource(fragment_shader, frag_shader_source)
	gl.compileShader(fragment_shader)

	status = gl.getShaderParameter(fragment_shader, gl.COMPILE_STATUS)
	if (!status) {
		console.error(`Couldn't compile fragment shader!\n${gl.getShaderInfoLog(fragment_shader)}`)
		return null
	}

	const program = gl.createProgram()
	gl.attachShader(program, vertex_shader)
	gl.attachShader(program, fragment_shader)
	gl.linkProgram(program)

	status = gl.getProgramParameter(program, gl.LINK_STATUS)
	if (!status) {
		console.error(`Couldn't link shader program!\n${gl.getProgramInfoLog(program)}`)
		return null
	}

	return program;
}


function shader_program_get_parameters(gl, program) {

	const parameters = {}
	let is_uniform = 0
		
	while(is_uniform < 2) {
		let param_type = is_uniform ? gl.ACTIVE_UNIFORMS : gl.ACTIVE_ATTRIBUTES
		let count = gl.getProgramParameter(program, param_type)
		
		for(let i=0; i < count; i++) {
			let details = null
			let location = null
			if(is_uniform){
				details = gl.getActiveUniform(program, i)
				location = gl.getUniformLocation(program, details.name)
			} else {
				details = gl.getActiveAttrib(program, i)
				location = gl.getAttribLocation(program, details.name)
			}
			
			parameters[details.name] = {
				location : location,
				uniform : !!is_uniform,
				type : details.type
			}
		}
		is_uniform++
	}

	return parameters
}


async function shader_fetch(url) {

	const response = await fetch(url);
	const shader_source = await response.text();
	return shader_source
}


function process_input() {

	// jump
	if(input.jump) {
		if(player.jump_reset && !(player.state & STATE.JUMP)) {
			player.state = player.state | STATE.JUMP
			animation_start_time = Date.now()
			player.jump_reset = false
		}
	}
	else if(!input.jump) {
		if(!(player.state & STATE.JUMP)) {
			player.jump_reset = true
		}
	}

	// roll
	if( (input.down && input.left) || (input.down && input.right) ) {
		if(!(player.state & STATE.ROLL)) {
			player.state = player.state | STATE.ROLL
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now() 
			}
		}
	}
	else if(!input.down) {
		if(!(player.state & STATE.ROLL)) {
			player.jump_reset = true
		}
	}

	if(input.right & input.left) {
		if(player.state & STATE.MOVE) {
			player.state = player.state ^ STATE.MOVE
		}
		if(!(player.state & STATE.JUMP) && !(player.state & STATE.ROLL)) {
			animation_start_time = Date.now()    
		}
	}
	else if(input.right) {
		if(!(player.state & STATE.MOVE) || player.special !== "") {
			player.state = player.state | STATE.MOVE
			player.special = ""
			if(!(player.state & STATE.JUMP) && !(player.state & STATE.ROLL)) {
				animation_start_time = Date.now()    
			}
		}
	}
	else if(input.left) {
		if(!(player.state & STATE.MOVE) || player.special !== "reversed") {
			player.state = player.state | STATE.MOVE
			player.special = "reversed"
			if(!(player.state & STATE.JUMP) && !(player.state & STATE.ROLL)) {
				animation_start_time = Date.now()
			}
		}
	}
	else if(!input.right && !input.left) {
		if(player.state & STATE.MOVE) {
			player.state = player.state ^ STATE.MOVE
			if(!(player.state & STATE.JUMP) && !(player.state & STATE.ROLL)) {
				animation_start_time = Date.now() 
			}
		}
	}

	if(input.attack1) {
		if(!(player.state & STATE.ATTACK1)) {
			player.state = player.state | STATE.ATTACK1
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now() 
			}
		}
	}
	else if(!input.attack1) {
		if(player.state & STATE.ATTACK1) {
			player.state = player.state ^ STATE.ATTACK1
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now()
			}
		}
	}

	if(input.attack2) {
		if(!(player.state & STATE.ATTACK2)) {
			player.state = player.state | STATE.ATTACK2
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now() 
			}
		}
	}
	else if(!input.attack2) {
		if(player.state & STATE.ATTACK2) {
			player.state = player.state ^ STATE.ATTACK2
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now()
			}
		}
	}

	if(input.attack3) {
		if(!(player.state & STATE.ATTACK3)) {
			player.state = player.state | STATE.ATTACK3
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now() 
			}
		}
	}
	else if(!input.attack3) {
		if(player.state & STATE.ATTACK3) {
			player.state = player.state ^ STATE.ATTACK3
			if(!(player.state & STATE.JUMP)) {
				animation_start_time = Date.now()
			}
		}
	}
}


function window_on_keydown(evt) {

	if(evt.key === "w") {
		input.up = true
	}
	else if(evt.key === "a") {
		input.left = true
	}
	else if(evt.key === "d") {
		input.right = true
	}
	else if(evt.key === "s") {
		input.down = true
	}
	else if(evt.key === " ") {
		input.jump = true
	}
	else if(evt.key === "e") {
		input.attack1 = true
	}
	else if(evt.key === "1" || evt.key === "q") {
		input.attack3 = true
	}
}


function window_on_keyup(evt) {

	if(evt.key === "w") {
		input.up = false
	}
	else if(evt.key === "a") {
		input.left = false
	}
	else if(evt.key === "d") {
		input.right = false
	}
	else if(evt.key === "s") {
		input.down = false
	}
	else if(evt.key === " ") {
		input.jump = false
	}
	else if(evt.key === "e") {
		input.attack1 = false
	}
	else if(evt.key === "1" || evt.key === "q") {
		input.attack3 = false
	}
}


function window_on_mousedown(evt) {
	if(evt.button === 0) {
		input.attack2 = true
	}
}


function window_on_mouseup(evt) {
	if(evt.button === 0) {
		input.attack2 = false
	}
}


function canvas_on_context(evt) {
	evt.preventDefault()
}


function calc_player_animation() {

	let tag = "idle"
	let animation_time = animation_idle_dtime


	if(player.state & STATE.FALL) {
		tag = "j_down"
	}
	else if(player.state & STATE.JUMP) {
		tag = "jump"
		animation_time /=  2
	}
	else if(player.state & STATE.ROLL) {
		tag = "roll"
	}
	else if(player.state & STATE.MOVE) {
		tag = "run"
	}
	else if(player.state & STATE.ATTACK1) {
		tag = "1_atk"
	}
	else if(player.state & STATE.ATTACK2) {
		tag = "2_atk"
	}
	else if(player.state & STATE.ATTACK3) {
		tag = "3_atk"
	}
	else if(player.state & STATE.IDLE) {
		tag = "idle"
	}

	let frame_count = 0
	let frame_from = 0
	for(const frame_stats of player.animations.meta.frameTags) {
		if(frame_stats.name === tag) {
			frame_count = frame_stats.from - frame_stats.to + 1
			frame_from = frame_stats.from
			break
		}
	}

	const frame_index = frame_from + Math.floor((Date.now() - animation_start_time) / animation_time) % frame_count
	const frame = player.animations.frames[frame_index].frame

	return frame
}


function calc_jump(stime, height, duration) {

	const const_x = Math.sqrt(height);

	let t = Date.now() - stime
	t = t - duration / 2
	t = t * const_x / (duration / 2);

	return height - t * t
}


function debug_state(state) {

	const states = []
	if(state & STATE.IDLE) {
		states.push("IDLE")
	}
	if(state & STATE.MOVE) {
		states.push("MOVE")
	}
	if(state & STATE.JUMP) {
		states.push("JUMP")
	}
	if(state & STATE.ROLL) {
		states.push("ROLL")
	}
	if(state & STATE.ATTACK1) {
		states.push("ATTACK1")
	}
	if(state & STATE.ATTACK2) {
		states.push("ATTACK2")
	}
	if(state & STATE.ATTACK3) {
		states.push("ATTACK3")
	}

	console.log(states.join(" | "))
}


async function json_fetch(url) {

	let response = await fetch(url)
	const json = await response.json()
	return json
}

function calc_tile_index(x, y, tw, th, lw) {

	const tile_index = Math.floor(x / tw) + Math.floor(y / th) * lw;
	return tile_index;
}