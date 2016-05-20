precision highp float;

attribute vec3 coordinate;
attribute vec2 textureCoordinate;

varying vec2 varyingTextureCoordinate;

void main(void) {
  gl_Position = vec4(coordinate,1.);
  varyingTextureCoordinate = textureCoordinate;
}