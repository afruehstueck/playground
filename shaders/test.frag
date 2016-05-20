precision highp float;

// PDE filter.
//
// phi is updated as a function of its gradient and the image gradient


uniform sampler2D sourceTextureSampler;
uniform sampler2D intermediateTextureSampler;
uniform vec2 sourceTextureSize;
uniform vec2 sourceTexelSize;
uniform vec2 focusPoint;
uniform int iteration;
uniform int numberOfIterations;
uniform float edgeWeight;

varying vec2 varyingTextureCoordinate;

vec4 pack_float(const in float value)
{
    const vec4 bit_shift = vec4(256.0*256.0*256.0, 256.0*256.0, 256.0, 1.0);
    const vec4 bit_mask  = vec4(0.0, 1.0/256.0, 1.0/256.0, 1.0/256.0);
    vec4 res = fract(value * bit_shift);
    res -= res.xxyz * bit_mask;
    return res;
}

float unpack_float(const in vec4 rgba_value)
{
    const vec4 bit_shift = vec4(1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1.0);
    float value = dot(rgba_value, bit_shift);
    return value;
}

void main(void) {
  // First time called, fill in distance transform
  // Last time called, move the label into RGB
  // Rest of the iterations, run the pde

  vec4 sourceColor = texture2D(sourceTextureSampler, varyingTextureCoordinate);
  vec4 phiRGBA = texture2D(intermediateTextureSampler, varyingTextureCoordinate);
  float phi = unpack_float(phiRGBA);
  vec4 outputColor;

  if (iteration == 0) {
    if ( length(varyingTextureCoordinate - focusPoint) < .03 ) {
      outputColor = pack_float( .999 );
    } else {
      outputColor = pack_float( 0. );
    }
  }

  if (iteration > 0 && iteration < numberOfIterations) {
    // calculate an iteration of delta phi

    #define S(point) unpack_float(texture2D(intermediateTextureSampler, varyingTextureCoordinate + point * sourceTexelSize));

    float sP0 = S( vec2(  1.,  0. ) );
    float s0P = S( vec2(  0.,  1. ) );
    float sN0 = S( vec2( -1.,  0. ) );
    float s0N = S( vec2(  0., -1. ) );

    #undef S

    vec2 gradient;
    // TODO upwind gradient: gradient = vec2( max(max(sP0-phi,phi-sN0),0.), max(max(s0P-phi,phi-s0N),0.) ) / sourceTexelSize;
    gradient = vec2( sP0-sN0, s0P-s0N ) / sourceTexelSize;

    float phiGradientMagnitude = length(gradient);

    #define S(point) texture2D(sourceTextureSampler, varyingTextureCoordinate + point * sourceTexelSize).r;

    sP0 = S( vec2(  1.,  0. ) );
    s0P = S( vec2(  0.,  1. ) );
    sN0 = S( vec2( -1.,  0. ) );
    s0N = S( vec2(  0., -1. ) );

    #undef S

    // TODO: rescale gradient:
    gradient = vec2( sP0-sN0, s0P-s0N ) / (2. * sourceTexelSize);
    //gradient = vec2( sP0-sN0, s0P-s0N );

    float sourceGradientMagnitude = length(gradient);

    float deltaT = .001;

    float phiValue;
    phiValue = phi + deltaT * phiGradientMagnitude * (1. / (1. + edgeWeight * sourceGradientMagnitude));

    phiValue = clamp(phiValue, 0., .9999);
    outputColor = pack_float(phiValue);
  }

  if (iteration == numberOfIterations) {
    if (phi > .001 && phi < 0.1) {
      outputColor = sourceColor + vec4(.4, .4, -.2, 1.0);
    } else {
      outputColor = sourceColor;
    }
    if ( length(varyingTextureCoordinate - focusPoint) < .01 ) {
      outputColor += vec4(-.4, -.4, .6, 1.);
    }
  }

  gl_FragColor = outputColor;
}