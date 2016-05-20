"use strict";

var focusPoint = [0.5, 0.5], // holds a value to be passed as a uniform to the shader
    numberOfIterations = 300,
    edgeWeight = 10.,
    sourceTextureSize = [0, 0];

//
// set up webGL
//
var renderCanvas = document.querySelector('#renderCanvas');
var gl = renderCanvas.getContext('webgl');
gl.clearColor(0.0, 0.0, 0.0, 1.0); // black, fully opaque
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL); // Near things obscure far things

// buffers for the textured plane in normalized space
var renderImageCoordinatesBuffer = gl.createBuffer();
var renderImageTextureCoordinatesBuffer = gl.createBuffer();
var renderImageVertices = [ -1., -1., 0., 1., -1., 0., -1.,  1., 0., 1.,  1., 0. ];
gl.bindBuffer(gl.ARRAY_BUFFER, renderImageCoordinatesBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(renderImageVertices), gl.STATIC_DRAW);

var renderImageTextureCoordinates = [ 0, 0,  1, 0,  0, 1,  1, 1 ];
gl.bindBuffer(gl.ARRAY_BUFFER, renderImageTextureCoordinatesBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(renderImageTextureCoordinates), gl.STATIC_DRAW);

// the source texture
var sourceTextureImage; // = new Image();
var sourceTexture = gl.createTexture();
var setupSourceTexture = function() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceTextureImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //gl.bindTexture(gl.TEXTURE_2D, null); // is this call needed? jvm

    sourceTextureSize[0] = sourceTextureImage.width;
    sourceTextureSize[1] = sourceTextureImage.height;
};

// extra textures and framebuffers for intermediate results of iterative filters and pipelines
var textures = [];
var framebuffers = [];
var setupFrameBuffers = function() {
    for (var ii = 0; ii < 2; ++ii) {
        // create a texture for the framebuffer
        var texture = gl.createTexture();
        //gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // do this now at end? or not needed for intermediates? jvm
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sourceTextureImage.width, sourceTextureImage.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // jvm - do we want nearest or linear?
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        textures.push(texture);

        // create a framebuffer
        var fbo = gl.createFramebuffer();
        framebuffers.push(fbo);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);

        // attach texture to frame buffer
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
};

// the program and shaders
var glProgram = gl.createProgram();
/* Loading fragment and vertex shaders using require.js */
require(["scripts/text!shaders/test.frag", "scripts/text!shaders/test.vert"],
    /* Callback when all resources have been loaded */
    function(fragmentShaderCode, vertexShaderCode) {
        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderCode);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            alert('Could not compile vertexShader');
            console.log(gl.getShaderInfoLog(vertexShader));
        }
        
        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderCode);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            alert('Could not compile fragmentShader');
            console.log(gl.getShaderInfoLog(fragmentShader));
        }
        
        gl.attachShader(glProgram, vertexShader);
        gl.deleteShader(vertexShader);
        
        gl.attachShader(glProgram, fragmentShader);
        gl.deleteShader(fragmentShader);
        
        gl.linkProgram(glProgram);
    }
);

// render a frame
function render() {
    gl.viewport(0, 0, renderCanvas.width, renderCanvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(glProgram);

    // set up the focus point (pointer position)
    gl.uniform2f(gl.getUniformLocation(glProgram, "focusPoint"), focusPoint[0], focusPoint[1]);

    // set up the sourceTextureSize
    gl.uniform2f(gl.getUniformLocation(glProgram, "sourceTextureSize"), sourceTextureSize[0], sourceTextureSize[1]);

    // set up the sourceTexelSize
    gl.uniform2f(gl.getUniformLocation(glProgram, "sourceTexelSize"), 1.0/sourceTextureSize[0], 1.0/sourceTextureSize[1]);

    // the sourceTexture
    gl.activeTexture(gl.TEXTURE0);  // bind sourceTexture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(glProgram, "sourceTextureSampler"), 0); // then, assign sourceTextureSampler to this texture unit


    // the strengthAndLabelTexture
    gl.activeTexture(gl.TEXTURE2);  // bind strengthAndLabelTexture to texture unit 2
    gl.bindTexture(gl.TEXTURE_2D, textures[1]); // use the first or second intermediate texture initially?
    gl.uniform1i(gl.getUniformLocation(glProgram, "intermediateTextureSampler"), 2); // then, assign intermediateTextureSampler to this texture unit

    // the coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, renderImageCoordinatesBuffer);
    var coordinateLocation = gl.getAttribLocation(glProgram, "coordinate");
    gl.enableVertexAttribArray( coordinateLocation );
    gl.vertexAttribPointer( coordinateLocation, 3, gl.FLOAT, false, 0, 0);

    // the textureCoordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, renderImageTextureCoordinatesBuffer);
    var textureCoordinateLocation = gl.getAttribLocation(glProgram, "textureCoordinate");
    gl.enableVertexAttribArray( textureCoordinateLocation );
    gl.vertexAttribPointer( textureCoordinateLocation, 2, gl.FLOAT, false, 0, 0);

    // (debug - run once. uncomment these lines and set "numberOfIterations" to -1)
    //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


    gl.uniform1i(gl.getUniformLocation(glProgram, "numberOfIterations"), numberOfIterations);
    gl.uniform1f(gl.getUniformLocation(glProgram, "edgeWeight"), edgeWeight);

    var i;
    for (i=0;i<=numberOfIterations;++i)
    {
        gl.uniform1i(gl.getUniformLocation(glProgram, "iteration"), i);

        // set the frame buffer to render into
        if (i < numberOfIterations) {
            // render into one of the texture framebuffers
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[i%2]);
        } else {
            // use the canvas frame buffer for last render
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        // the primitive, triggers the fragment shader
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // switch the intermediate texture
        gl.activeTexture(gl.TEXTURE2); // Use TEXTURE2 as the intermediate image for  Grow Cut
        gl.bindTexture(gl.TEXTURE_2D, textures[i % 2]);
    }
}

function setupInterface() {
    //
    // set up the drawCanvas
    //
    var sourceImage = $('#sourceImage')[0];

    function initializePDE() {
        sourceTextureImage = $('#sourceImage')[0];
        setupSourceTexture(); // jvm - changes these to take image as parameter? change these to keep things as fields in image[i]?
        setupFrameBuffers();
        renderCanvas.height = sourceTextureImage.height;
        renderCanvas.width = sourceTextureImage.width;
        $('#numberOfIterations').width(sourceTextureImage.width);
        $('#edgeWeight').width(sourceTextureImage.width);
        updateParameters();
    }
    initializePDE();

    //
    // user interface elements
    //
    function updateParameters() {
        numberOfIterations = Number(document.getElementById('numberOfIterations').value);
        edgeWeight = Number(document.getElementById('edgeWeight').value);
        render();
    }

    // listen to continuous and release events
    // http://stackoverflow.com/questions/18544890/onchange-event-on-input-type-range-is-not-triggering-in-firefox-while-dragging
    document.getElementById('numberOfIterations').onchange = updateParameters;
    document.getElementById('edgeWeight').onchange = updateParameters;
    document.getElementById('numberOfIterations').oninput = updateParameters;
    document.getElementById('edgeWeight').oninput = updateParameters;

    //
    // drawing functions
    //

    var drawing = false;
    var drawStartNumberOfIterations;
    var seedPoint = [.5,.5];
    var currentPoint = [0., 0.];

    function normalizeCoordinate(x, y) {
        return [x / sourceImage.width, 1. - (y / sourceImage.height)];
    }
    function startDraw(event) {
        drawing = true;
        drawStartNumberOfIterations = numberOfIterations;
        seedPoint = normalizeCoordinate(event.offsetX, event.offsetY);
        focusPoint = normalizeCoordinate(event.offsetX, event.offsetY);
        updateDraw(event);
    }
    function endDraw(event) {
        drawing = false;
        updateDraw(event);
    }
    function updateDraw (event) {
        currentPoint = normalizeCoordinate(event.offsetX, event.offsetY);
        if (drawing) {
            focusPoint = seedPoint;
            var iterationDelta = Math.round(2000. * (currentPoint[0]-seedPoint[0]));
            document.getElementById('numberOfIterations').value = drawStartNumberOfIterations + iterationDelta;

            // // disabled for now
            // edgeWeight = 1. + 50. * Math.abs(seedPoint[1]-currentPoint[1]);
            // document.getElementById('edgeWeight').value = edgeWeight;
        }
        updateParameters();
    }
    $('#renderCanvas').mousedown(startDraw);
    $('#renderCanvas').mousemove(updateDraw);
    $('#renderCanvas').mouseup(endDraw);
    $('#renderCanvas').mouseout(endDraw);

}

// once document is loaded, then load images, set up textures and framebuffers, and render
$(function () {
    $('#sourceImage').load(setupInterface);
});