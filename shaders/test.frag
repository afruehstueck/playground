precision highp float;

// PDE filter.
//
// phi is updated as a function of its gradient and the image gradient


uniform sampler2D sourceTextureSampler;
uniform sampler2D distanceFieldSampler;
uniform vec2 sourceTextureSize;
uniform vec2 sourceTexelSize;
uniform vec2 seedOrigin;
uniform float seedRadius;
uniform int iteration;
uniform int renderToTexture;
uniform int numberOfIterations;
uniform float edgeWeight;
uniform float alpha;

varying vec2 textureCoordinate;

//encoding a single float value to RGBA integer texture
vec4 encode_float( const in float value ) {
    const vec4 bit_shift = vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 );
    const vec4 bit_mask  = vec4( 0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0 );
    vec4 res = fract( value * bit_shift );
    res -= res.xxyz * bit_mask;
    return res;
}

//decoding float value from RGBA integer texture
float decode_float( const in vec4 rgba_value ) {
    const vec4 bit_shift = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );
    float value = dot( rgba_value, bit_shift );
    return value;
}

vec4 initialize_distance_field() {
    vec4 color;
    float distanceToSeed = length( textureCoordinate - seedOrigin );
    float currentDistance = seedRadius - distanceToSeed; //should be negative outside of radius and positive inside of radius

    //normalize to [0, 1] range
    float normalizedDistance = (distanceToSeed + 1.0) / 2.0;

    /*
    if ( length( textureCoordinate - seedOrigin ) < seedRadius ) {
      color = encode_float( .999 );
    } else {
      color = encode_float( 0. );
    }
    color = vec4(normalizedDistance, normalizedDistance, normalizedDistance, 1.0);

    if(normalizedDistance - 0.5 < 0.0001) {
      color = vec4(normalizedDistance, 0.0, 0.0, 1.0);
    } else {
       color = vec4(0.0, normalizedDistance, normalizedDistance, 1.0);
     }
    */
    return encode_float( normalizedDistance );
}

void main( void ) {
  // First time called, fill in currentDistance transform
  // Last time called, move the label into RGB
  // Rest of the iterations, run the pde

  vec4 distance_encoded = texture2D( distanceFieldSampler, textureCoordinate );
  float currentDistance = decode_float( distance_encoded );

  //TODO this is a temporary choice in selecting the target value
  vec4 targetColor = texture2D( sourceTextureSampler, seedOrigin );

  vec4 sourceColor = texture2D( sourceTextureSampler, textureCoordinate );
  vec4 distanceFieldValue;
  vec4 outputColor;

  //initialize currentDistance field with 1 where overlapping with seed region and 0 where not.
  if ( renderToTexture == 1 && iteration == 0 ) {
    distanceFieldValue = initialize_distance_field();
    gl_FragColor = distanceFieldValue;
    return;
  } else if ( renderToTexture == 1 && iteration > 0 && iteration < numberOfIterations ) {

    /* calculate all the Ds */
    #define S( p ) decode_float( texture2D( distanceFieldSampler, textureCoordinate + p * sourceTexelSize ) );

    float u0 = S ( vec2( -1., -1. ) );
    float u1 = S ( vec2(  0., -1. ) );
    float u2 = S ( vec2(  1., -1. ) );
    float u3 = S ( vec2( -1.,  0. ) );
    float u4 = currentDistance;
    float u5 = S ( vec2(  1.,  0. ) );
    float u6 = S ( vec2( -1.,  1. ) );
    float u7 = S ( vec2(  0.,  1. ) );
    float u8 = S ( vec2(  1.,  1. ) );

    float Dx   = (u5 - u3) / 2.;
    float Dy   = (u7 - u1) / 2.;
    float Dxp  = (u5 - u4);
    float Dyp  = (u7 - u4);
    float Dxm  = (u4 - u3);
    float Dym  = (u4 - u1);
    float Dxpy = (u8 - u6) / 2.;
    float Dxmy = (u2 - u0) / 2.;
    float Dypx = (u8 - u2) / 2.;
    float Dymx = (u6 - u0) / 2.;

    float npx = Dxp / sqrt( pow( Dxp, 2. ) + pow( ( Dypx + Dy ) / 2., 2. ) );
    float npy = Dyp / sqrt( pow( Dyp, 2. ) + pow( ( Dxpy + Dx ) / 2., 2. ) );

    float nmx = Dxm / sqrt( pow( Dxm, 2. ) + pow( ( Dymx + Dy ) / 2., 2. ) );
    float nmy = Dym / sqrt( pow( Dym, 2. ) + pow( ( Dxmy + Dx ) / 2., 2. ) );

    float H = ( npx - nmx + npy - nmy ) / 2.;

    vec2 grad_phi_max = vec2( sqrt( pow( max( Dxp, 0. ), 2. ) + pow( max( -Dxm, 0. ), 2. ) ), sqrt( pow( max( Dyp, 0. ), 2. ) + pow( max( -Dym, 0. ), 2. ) ) );
    vec2 grad_phi_min = vec2( sqrt( pow( min( Dxp, 0. ), 2. ) + pow( min( -Dxm, 0. ), 2. ) ), sqrt( pow( min( Dyp, 0. ), 2. ) + pow( min( -Dym, 0. ), 2. ) ) );

    //TODO give F a meaningful value
    float F = 0.5;
    float gradient_value = (F > 0.) ? length( grad_phi_max ) : length( grad_phi_min );

    float eps = 0.05;

    float D = eps - abs( length( sourceColor.xyz - targetColor.xyz ) );

    float final_value = gradient_value * ( alpha * D + ( 1. - alpha ) * H );

    distanceFieldValue = encode_float( final_value );
    gl_FragColor = distanceFieldValue;
    return;
  } else {
    /* draw outline of border */
    //if ( currentDistance > .49 && currentDistance < 0.51 ) {
      outputColor == vec4( currentDistance, currentDistance, currentDistance, 1.0 );
      //outputColor = sourceColor + vec4( .4, .4, -.2, 1.0 );
    //} else {
      //outputColor = sourceColor;
    //}

    /* draw outline of seed */
    float distanceToSeed = length( textureCoordinate - seedOrigin );
    float circleWidth = 0.001;
    if ( distanceToSeed > seedRadius - circleWidth && distanceToSeed < seedRadius + circleWidth ) {
      outputColor += vec4( 0.0, 1.0, 0.0, 0.5 ); //seed point
      //outputColor += vec4( -.4, -.4, .6, 1. );
    }
    gl_FragColor = outputColor;
    return;
  }

}
