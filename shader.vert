#version 300 es

uniform vec2 u_screensize;
uniform vec2 u_displacement;
in vec3 a_position;
in vec2 a_texcoord;
out vec2 v_texcoord;

void main(){
    v_texcoord = a_texcoord;
    vec4 position = vec4(
        a_position.x * +2.0 / u_screensize.x - 1.0,
        a_position.y * -2.0 / u_screensize.y + 1.0,
        a_position.z,
        1.0 );
    position.x += u_displacement.x;
    position.y += u_displacement.y;
    gl_Position = position;
}