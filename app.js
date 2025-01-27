

let gl = null
let canvas = null
const rasterizer = { program: null, locations: null }
const textures = new Map()

const PLAYER_SCALE = 1
const PLAYER_Y_OFFSET = 64
const PLAYER_SPEED = 2
const PIXEL_TRIM = 0

let level = null
let data = null
let pos_buffer = null
let tex_buffer = null

let draw_configurations = []

const STATE = {
	NONE:			0,
	IDLE:			1,
	MOVE:			2,
	FRONT_ATTACK_1:	4,
	FRONT_ATTACK_2:	8,
	DOWN_ATTACK_1:	16,
	DOWN_ATTACK_2:	32,
	UP_ATTACK_1:	64,
	UP_ATTACK_2:	128,
}

const animation_idle_dtime = 100

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

const entity = {
	state: STATE.IDLE,
	x: 220,
	y: 384,
	special: "",
	sprites: null,
	animations: null,
	texture: null,
	pos_buffer: 0,
	tex_buffer: 0,
	geometry: null,
	// movement
	destination: { x: 0, y: 0 },
	dmove: { x: 0, y: 0},			// based on PLAYER_SPEED
}


const debug = {
	x: 0,
	y: 0,
	path: "resources/Tiny Swords (Update 010)/UI/Pointers/02.png",
	texture: null,
	pos_buffer: 0,
	tex_buffer: 0,
	geometry: null,
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

	level = await tiled_fetch("resources/top-level.tmj")
	data = level_generate_geometry(level)

	pos_buffer = gl.createBuffer()
	tex_buffer = gl.createBuffer()

	gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.positions), gl.STATIC_DRAW)
	gl.bindBuffer(gl.ARRAY_BUFFER, tex_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.texcoords), gl.STATIC_DRAW)

	// to fix
	entity.pos_buffer = gl.createBuffer()
	entity.tex_buffer = gl.createBuffer()

	entity.animations = await aseprite_fetch("resources/Warrior_Blue.json")		//loaded as a script src in the HTML (index.html)
	const texture = textures.get(entity.animations.meta.image)
	entity.sprites = texture.image
	entity.texture = texture.id


	// debug stuff
	debug.pos_buffer = gl.createBuffer()
	debug.tex_buffer = gl.createBuffer()

	const image = await image_load(debug.path)
	const id = texture_create(image)
	textures.set(debug.path, { source: debug.path, image: image, id: id })

	const debug_texture = textures.get(debug.path)
	debug.sprites = debug_texture.image
	debug.texture = debug_texture.id


	animation_start_time = Date.now()

	window.addEventListener("keydown", window_on_keydown)
	window.addEventListener("keyup", window_on_keyup)
	window.addEventListener("mousemove", window_on_mousemove)
	window.addEventListener("mousedown", window_on_mousedown)
	window.addEventListener("mouseup", window_on_mouseup)
	// window.addEventListener("contextmenu", canvas_on_context)	

	window.requestAnimationFrame(loop)
}


async function tiled_fetch(url) {

	let base = url.split("/").slice(0, -1).join("/")
	let response = await fetch(url);
	const level = await response.json();

	for(const ts of level.tilesets) {

		if(typeof ts.image !== "undefined") {
			const source = ts.image
			const image = await image_load(`${base}/${source}`)
			const id = texture_create(image)
			textures.set(source, { source: source, image: image, id: id })
		}
		else if(ts.source !== "undefined") {

			let response = await fetch(`resources/${ts.source}`);
			const tsj = await response.json();

			for(let prop in tsj) {
				ts[prop] = tsj[prop]
			}

			if(typeof tsj.image !== "undefined") {
				const source = tsj.image
				const image = await image_load(`${base}/${source}`)
				const id = texture_create(image)
				textures.set(source, { source: source, image: image, id: id })
			}
		}
	}

	for(const layer of level.layers) {
		if(layer.type === "imagelayer") {
			const source = layer.image
			const image = await image_load(`${base}/${source}`)
			const id = texture_create(image)
			textures.set(source, { source: source, image: image, id: id })
		}
	}

	if(typeof level.backgroundcolor !== "undefined") {

		let color = { r: 0, g: 0, b: 0 }
		if(level.backgroundcolor.length === 7) {
			let c = parseInt(level.backgroundcolor.substring(1), 16);
			color.r = ((c & 0xff0000) >> 16 ) / 255
			color.g = ((c & 0x00ff00) >> 8  ) / 255
			color.b = ((c & 0x0000ff) 		) / 255
		}
		level.backgroundcolor = color
	}

	return level
}


async function aseprite_fetch(url) {

	let base = url.split("/").slice(0, -1).join("/")
	let response = await fetch(url);
	const sprite = await response.json()

	const source = sprite.meta.image
	const image = await image_load(`${base}/${source}`)
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

	// compile a list of layers to draw, considering groups and potentially nested groups of layers
	const layers_list = Array.from(level.layers)
	const layers_draw = []
	let index = 0;
	while(index < layers_list.length) {

		const layer = layers_list[index]
		if(layer.type === "tilelayer" && layer.visible === true) {
			layers_draw.push(layer)
		}
		else if(layer.type === "group") {
			for(const l of layer.layers) {
				layers_list.push(l)
			}
		}
		index++
	}

	for(let i=0; i<layers_draw.length; i++) {

		const layer = layers_draw[i]
		const z = (layers_draw.length - i) / layers_draw.length

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

	// only works with depth test
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
		entity.x - (player_frame.w * PLAYER_SCALE / 2),	entity.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE + PLAYER_Y_OFFSET,	0,
		entity.x - (player_frame.w * PLAYER_SCALE / 2),	entity.y + PLAYER_Y_OFFSET,													0,
		entity.x + (player_frame.w * PLAYER_SCALE / 2),	entity.y + PLAYER_Y_OFFSET,													0,

		entity.x + (player_frame.w * PLAYER_SCALE / 2),	entity.y + PLAYER_Y_OFFSET,													0,
		entity.x + (player_frame.w * PLAYER_SCALE / 2),	entity.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE + PLAYER_Y_OFFSET,	0,
		entity.x - (player_frame.w * PLAYER_SCALE / 2),	entity.y - (player_frame.h - PIXEL_TRIM) * PLAYER_SCALE + PLAYER_Y_OFFSET,	0,
	]
	
	const u = player_frame.x / entity.sprites.width
	const v = player_frame.y / entity.sprites.height
	const s = player_frame.w / entity.sprites.width
	const t = player_frame.h / entity.sprites.height

	let texcoords = [
		u,		v,
		u, 		v+t,
		u+s,	v+t,
		u+s,	v+t,
		u+s,	v,
		u, 		v
	]

	if(entity.special === "reversed") {
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


function debug_generate_geometry(debug) {

	const positions = [
		debug.x - (64 / 2),	debug.y - (64) + 32,	0,
		debug.x - (64 / 2),	debug.y + 32,			0,
		debug.x + (64 / 2),	debug.y + 32,			0,

		debug.x + (64 / 2),	debug.y + 32,			0,
		debug.x + (64 / 2),	debug.y - (64) + 32,	0,
		debug.x - (64 / 2),	debug.y - (64) + 32,	0,
	]
	
	const u = 0
	const v = 0
	const s = 1
	const t = 1

	let texcoords = [
		u,		v,
		u, 		v+t,
		u+s,	v+t,
		u+s,	v+t,
		u+s,	v,
		u, 		v
	]

	return { positions: positions, texcoords: texcoords }
}


function loop(timestamp) {

	// process key down/up and mouse down/up and set entity.state
	process_input();

	if(entity.state === STATE.MOVE) {
		entity.x += entity.dmove.x
		entity.y += entity.dmove.y
	}

	// console.log(`${entity.destination.x - Math.abs(entity.dmove.x)} < ${entity.x} < ${entity.destination.x + Math.abs(entity.dmove.x)}`)
	// console.log(`${entity.destination.y - Math.abs(entity.dmove.y)} < ${entity.y} < ${entity.destination.y + Math.abs(entity.dmove.y)}`)

	if( entity.x >= entity.destination.x - Math.abs(entity.dmove.x) && entity.x <= entity.destination.x + Math.abs(entity.dmove.x) &&
		entity.y >= entity.destination.y - Math.abs(entity.dmove.y) && entity.y <= entity.destination.y + Math.abs(entity.dmove.y) ) {

			// adjust entity movement
			entity.x = Math.floor(entity.x / 64) * 64 + 32
			entity.y = Math.floor(entity.y / 64) * 64 + 32
			entity.state = STATE.IDLE
	}

	const player_frame = calc_player_animation()
	entity.geometry = player_generate_geometry(player_frame)

	debug.geometry = debug_generate_geometry(debug)

	draw()

	window.requestAnimationFrame(loop)
}


function draw() {

	gl.clearColor(level.backgroundcolor.r, level.backgroundcolor.g, level.backgroundcolor.b, 1)
	// gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)		// clear screen
	gl.clear(gl.COLOR_BUFFER_BIT)		// clear screen

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

	// draw debug
	gl.bindBuffer(gl.ARRAY_BUFFER, debug.pos_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(debug.geometry.positions), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_position.location)
	gl.vertexAttribPointer(rasterizer.locations.a_position.location, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, debug.tex_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(debug.geometry.texcoords), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_texcoord.location)
	gl.vertexAttribPointer(rasterizer.locations.a_texcoord.location, 2, gl.FLOAT, false, 0, 0)

	const debug_texture_id = textures.get(debug.path).id
	gl.bindTexture(gl.TEXTURE_2D, debug_texture_id)
	gl.drawArrays(gl.TRIANGLES, 0, 6)



	// draw player
	gl.bindBuffer(gl.ARRAY_BUFFER, entity.pos_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(entity.geometry.positions), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_position.location)
	gl.vertexAttribPointer(rasterizer.locations.a_position.location, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, entity.tex_buffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(entity.geometry.texcoords), gl.DYNAMIC_DRAW)
	gl.enableVertexAttribArray(rasterizer.locations.a_texcoord.location)
	gl.vertexAttribPointer(rasterizer.locations.a_texcoord.location, 2, gl.FLOAT, false, 0, 0)

	const texture_id = textures.get("Warrior_Blue.png").id
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

}


function window_on_keydown(evt) {
}


function window_on_keyup(evt) {
}


function window_on_mousemove(evt) {

	const bbox = document.querySelector("#display").getBoundingClientRect()
	debug.x = Math.floor((evt.clientX - bbox.left) / 64) * 64 + 32
	debug.y = Math.floor((evt.clientY - bbox.top) / 64) * 64 + 32
}

function window_on_mousedown(evt) {
	if(evt.button === 0) {

		entity.state = STATE.MOVE
		const bbox = document.querySelector("#display").getBoundingClientRect()
		entity.destination.x = Math.floor((evt.clientX - bbox.left) / 64) * 64 + 32
		entity.destination.y = Math.floor((evt.clientY - bbox.top) / 64) * 64 + 32
		console.log(entity.destination)

		const distance = Math.sqrt( (entity.x - entity.destination.x) * (entity.x - entity.destination.x) + (entity.y - entity.destination.y) * (entity.y - entity.destination.y) )
		entity.dmove.x = PLAYER_SPEED / distance * (entity.destination.x - entity.x)
		entity.dmove.y = PLAYER_SPEED / distance * (entity.destination.y - entity.y)
		console.log(entity.dmove)

		debug.x = Math.floor(entity.destination.x / 64) * 64 + 32
		debug.y = Math.floor(entity.destination.y / 64) * 64 + 32
	}
}


function window_on_mouseup(evt) {
	if(evt.button === 0) {

	}
}


function canvas_on_context(evt) {
	evt.preventDefault()
}


function calc_player_animation() {

	let tag = "idle"
	let animation_time = animation_idle_dtime

	if(entity.state & STATE.IDLE) {
		tag = "idle"
	}
	else if(entity.state & STATE.MOVE) {
		tag = "run"
	}

	let frame_count = 0
	let frame_from = 0
	for(const frame_stats of entity.animations.meta.frameTags) {
		if(frame_stats.name === tag) {
			frame_count = frame_stats.from - frame_stats.to + 1
			frame_from = frame_stats.from
			break
		}
	}

	const frame_index = frame_from + Math.floor((Date.now() - animation_start_time) / animation_time) % frame_count
	const frame = entity.animations.frames[frame_index].frame

	return frame
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