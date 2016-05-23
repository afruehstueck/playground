'use strict';

var seedPoint = [ 0.8, 0.6 ], // holds a value to be passed as a uniform to the shader
    numberOfIterations = 300,
    edgeWeight = 10.,
    sourceTextureSize = [ 0, 0 ];

//
// set up webGL
//
var renderCanvas = document.querySelector( '#renderCanvas' );
var gl = renderCanvas.getContext( 'webgl' );
gl.clearColor( 0.0, 0.0, 0.0, 1.0 ); // black, fully opaque
gl.enable( gl.DEPTH_TEST );
gl.depthFunc( gl.LEQUAL ); // Near things obscure far things

// buffers for the textured plane in normalized space
var renderImageCoordinatesBuffer = gl.createBuffer();
var renderImageTextureCoordinatesBuffer = gl.createBuffer();
var renderImageVertices = [ -1., -1., 0., 1., -1., 0., -1., 1., 0., 1., 1., 0. ];
gl.bindBuffer( gl.ARRAY_BUFFER, renderImageCoordinatesBuffer );
gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( renderImageVertices ), gl.STATIC_DRAW );

var renderImageTextureCoordinates = [ 0, 0, 1, 0, 0, 1, 1, 1 ];
gl.bindBuffer( gl.ARRAY_BUFFER, renderImageTextureCoordinatesBuffer );
gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( renderImageTextureCoordinates ), gl.STATIC_DRAW );

// the source texture
var sourceTextureImage; // = new Image();
var sourceTexture = gl.createTexture();
var setupSourceTexture = function () {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, sourceTexture );
    gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, true );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceTextureImage );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
    //gl.bindTexture(gl.TEXTURE_2D, null); // is this call needed? jvm

    sourceTextureSize[ 0 ] = sourceTextureImage.width;
    sourceTextureSize[ 1 ] = sourceTextureImage.height;
};

// extra textures and framebuffers for intermediate results of iterative filters and pipelines
var textures = [];
var framebuffers = [];

var setupFrameBuffers = function () {
    for ( var idx = 0; idx < 2; ++idx ) {
        // create a texture for the frame buffer
        var texture = gl.createTexture();
        gl.bindTexture( gl.TEXTURE_2D, texture );
        //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // do this now at end? or not needed for intermediates? jvm
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, sourceTextureImage.width, sourceTextureImage.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR ); // jvm - do we want nearest or linear?
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
        textures.push( texture );

        // create a framebuffer
        var fbo = gl.createFramebuffer();
        framebuffers.push( fbo );
        gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
        gl.clearColor( 0.0, 0.0, 0.0, 1.0 );

        // attach texture to frame buffer
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0 );
        gl.clear( gl.COLOR_BUFFER_BIT );
    }
};

// the program and shaders
var glProgram = gl.createProgram();
var deferred = $.Deferred();

/* Loading fragment and vertex shaders using require.js */
var setupShaders = function ( fragmentShaderLocation, vertexShaderLocation ) {
    require( [ fragmentShaderLocation, vertexShaderLocation ],
        /* Callback function initializing shaders when all resources have been loaded */
        function ( fragmentShaderCode, vertexShaderCode ) {
            var vertexShader = gl.createShader( gl.VERTEX_SHADER );
            gl.shaderSource( vertexShader, vertexShaderCode );
            gl.compileShader( vertexShader );
            if ( !gl.getShaderParameter( vertexShader, gl.COMPILE_STATUS ) ) {
                alert( 'Could not compile vertexShader' );
                console.log( gl.getShaderInfoLog( vertexShader ) );
            }

            var fragmentShader = gl.createShader( gl.FRAGMENT_SHADER );
            gl.shaderSource( fragmentShader, fragmentShaderCode );
            gl.compileShader( fragmentShader );
            if ( !gl.getShaderParameter( fragmentShader, gl.COMPILE_STATUS ) ) {
                alert( 'Could not compile fragmentShader' );
                console.log( gl.getShaderInfoLog( fragmentShader ) );
            }

            gl.attachShader( glProgram, vertexShader );
            gl.deleteShader( vertexShader );

            gl.attachShader( glProgram, fragmentShader );
            gl.deleteShader( fragmentShader );

            gl.linkProgram( glProgram );
            deferred.resolve();
        }
    );

    return deferred.promise();
};

/* attrib locations */
var loc_coordinate,
    loc_texCoord;

/* uniform locations */
var loc_seedPoint,
    loc_sourceTextureSize,
    loc_sourceTexelSize,
    loc_sourceTextureSampler,
    loc_intermediateTextureSampler,
    loc_numIteration,
    loc_edgeWeight,
    loc_iteration;

var storeLocations = function () {
    loc_coordinate = gl.getAttribLocation( glProgram, 'coordinate' );
    loc_texCoord = gl.getAttribLocation( glProgram, 'textureCoordinate' );
    loc_seedPoint = gl.getUniformLocation( glProgram, 'seedPoint' );
    loc_sourceTextureSize = gl.getUniformLocation( glProgram, 'sourceTextureSize' );
    loc_sourceTexelSize = gl.getUniformLocation( glProgram, 'sourceTexelSize' );
    loc_sourceTextureSampler = gl.getUniformLocation( glProgram, 'sourceTextureSampler' );
    loc_intermediateTextureSampler = gl.getUniformLocation( glProgram, 'intermediateTextureSampler' );
    loc_numIteration = gl.getUniformLocation( glProgram, 'numberOfIterations' );
    loc_edgeWeight = gl.getUniformLocation( glProgram, 'edgeWeight' );
    loc_iteration = gl.getUniformLocation( glProgram, 'iteration' );
}

// render a frame
function render() {
    gl.viewport( 0, 0, renderCanvas.width, renderCanvas.height );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    gl.useProgram( glProgram );

    // set up the focus point (pointer position)
    gl.uniform2f( loc_seedPoint, seedPoint[ 0 ], seedPoint[ 1 ] );

    // set up the sourceTextureSize
    gl.uniform2f( loc_sourceTextureSize, sourceTextureSize[ 0 ], sourceTextureSize[ 1 ] );

    // set up the sourceTexelSize
    gl.uniform2f( loc_sourceTexelSize, 1.0 / sourceTextureSize[ 0 ], 1.0 / sourceTextureSize[ 1 ] );

    // the sourceTexture
    gl.activeTexture( gl.TEXTURE0 );  // bind sourceTexture to texture unit 0
    gl.bindTexture( gl.TEXTURE_2D, sourceTexture );
    gl.uniform1i( loc_sourceTextureSampler, 0 ); // then, assign sourceTextureSampler to this texture unit

    // the strengthAndLabelTexture
    gl.activeTexture( gl.TEXTURE2 );  // bind strengthAndLabelTexture to texture unit 2
    gl.bindTexture( gl.TEXTURE_2D, textures[ 1 ] ); // use the first or second intermediate texture initially?
    gl.uniform1i( loc_intermediateTextureSampler, 2 ); // then, assign intermediateTextureSampler to this texture unit

    // the coordinate attribute
    gl.bindBuffer( gl.ARRAY_BUFFER, renderImageCoordinatesBuffer );
    gl.enableVertexAttribArray( loc_coordinate );
    gl.vertexAttribPointer( loc_coordinate, 3, gl.FLOAT, false, 0, 0 );

    // the textureCoordinate attribute
    gl.bindBuffer( gl.ARRAY_BUFFER, renderImageTextureCoordinatesBuffer );
    gl.enableVertexAttribArray( loc_texCoord );
    gl.vertexAttribPointer( loc_texCoord, 2, gl.FLOAT, false, 0, 0 );

    // (debug - run once. uncomment these lines and set 'numberOfIterations' to -1)
    //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.uniform1i( loc_numIteration, numberOfIterations );
    gl.uniform1f( loc_edgeWeight, edgeWeight );

    var iteration;
    for ( iteration = 0; iteration <= numberOfIterations; ++iteration ) {
        gl.uniform1i( loc_iteration, iteration );

        // set the frame buffer to render into
        if ( iteration < numberOfIterations ) {
            // render into one of the texture framebuffers
            gl.bindFramebuffer( gl.FRAMEBUFFER, framebuffers[ iteration % 2 ] );
            //gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
        } else {
            // use the canvas frame buffer for last render
            gl.bindFramebuffer( gl.FRAMEBUFFER, null );
        }
        // the primitive, triggers the fragment shader
        gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );

        // switch the intermediate texture
        gl.activeTexture( gl.TEXTURE2 ); // Use TEXTURE2 as the intermediate image for Grow Cut
        gl.bindTexture( gl.TEXTURE_2D, textures[ iteration % 2 ] );
    }

    /*    (function iterate (i) {
     setTimeout(function () {
     iteration = numberOfIterations - i;
     gl.uniform1i( gl.getUniformLocation( glProgram, 'iteration' ), iteration );

     // set the frame buffer to render into
     if ( iteration < numberOfIterations ) {
     // render into one of the texture framebuffers
     gl.bindFramebuffer( gl.FRAMEBUFFER, framebuffers[ iteration % 2 ] );
     gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
     }
     // use the canvas frame buffer for last render
     gl.bindFramebuffer( gl.FRAMEBUFFER, null );

     // the primitive, triggers the fragment shader
     gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );

     // switch the intermediate texture
     gl.activeTexture( gl.TEXTURE2 ); // Use TEXTURE2 as the intermediate image for Grow Cut
     gl.bindTexture( gl.TEXTURE_2D, textures[ iteration % 2 ] );

     if (--i) {          // If i > 0, keep going
     iterate(i);       // Call the loop again, and pass it the current value of i
     }
     }, 10);
     })(numberOfIterations);*/
}

function setupInterface() {
    //
    // set up the drawCanvas
    //
    sourceTextureImage = $( '#sourceImage' )[ 0 ];

    setupSourceTexture(); // jvm - changes these to take image as parameter? change these to keep things as fields in image[i]?

    setupFrameBuffers();
    renderCanvas.height = sourceTextureImage.height;
    renderCanvas.width = sourceTextureImage.width;
    $( '#numberOfIterations' ).width( sourceTextureImage.width );
    $( '#edgeWeight' ).width( sourceTextureImage.width );
    $.when( setupShaders( 'scripts/text!shaders/test.frag', 'scripts/text!shaders/test.vert' ) ).done( function () {
        storeLocations();
        updateParameters();
    } );

    //
    // user interface elements
    //
    function updateParameters() {
        $( '#log' ).html( '... updated!' );
        numberOfIterations = Number( document.getElementById( 'numberOfIterations' ).value );
        edgeWeight = Number( document.getElementById( 'edgeWeight' ).value );
        render();
    }

    // listen to continuous and release events
    // http://stackoverflow.com/questions/18544890/onchange-event-on-input-type-range-is-not-triggering-in-firefox-while-dragging
    document.getElementById( 'numberOfIterations' ).onchange = updateParameters;
    document.getElementById( 'edgeWeight' ).onchange = updateParameters;
    document.getElementById( 'numberOfIterations' ).oninput = updateParameters;
    document.getElementById( 'edgeWeight' ).oninput = updateParameters;

    //
    // drawing functions
    //

    var drawing = false;
    var drawStartNumberOfIterations;
    var currentPoint = [ 0., 0. ];

    function normalizeCoordinate( x, y ) {
        return [ x / sourceTextureImage.width, 1. - ( y / sourceTextureImage.height ) ];
    }

    function startDraw( event ) {
        drawing = true;
        drawStartNumberOfIterations = numberOfIterations;
        seedPoint = normalizeCoordinate( event.offsetX, event.offsetY );
        updateDraw( event );
    }

    function endDraw( event ) {
        drawing = false;
        updateDraw( event );
    }

    function updateDraw( event ) {
        currentPoint = normalizeCoordinate( event.offsetX, event.offsetY );
        if ( drawing ) {
            var iterationDelta = Math.round( 2000. * ( currentPoint[ 0 ] - seedPoint[ 0 ] ) );
            document.getElementById( 'numberOfIterations' ).value = drawStartNumberOfIterations + iterationDelta;

            // // disabled for now
            // edgeWeight = 1. + 50. * Math.abs(seedPoint[1]-currentPoint[1]);
            // document.getElementById('edgeWeight').value = edgeWeight;
        }
        updateParameters();
    }

    $( '#renderCanvas' ).mousedown( startDraw );
    $( '#renderCanvas' ).mousemove( updateDraw );
    $( '#renderCanvas' ).mouseup( endDraw );
    $( '#renderCanvas' ).mouseout( endDraw );

}

// once document is loaded, then load images, set up textures and framebuffers, and render
$( function () {
    $( '#sourceImage' ).load( setupInterface );
} );