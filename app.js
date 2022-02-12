// audio context stuff
let audioContext = Pizzicato.context;
globalAppGain = audioContext.createGain();
globalAppGain.gain.value = 0.75;
globalAppGain.connect(audioContext.destination);

//get microphone input, create micInputSource audio node with it
micInputSource = null;
micMonitor = false;
navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function(stream){
    try{micInputSource.disconnect(globalAppGain)}catch{}
    micInputSource = audioContext.createMediaStreamSource(stream);
    audioContext.resume();
});
rec = new Recorder(globalAppGain); //recorder

// state variables
let effectsName = ["REV", "DEL", "FLG", "PAN", "LPF", "CLN"];
var DELAYCOMPENSATION = 5000; // number of samples to remove from the beginning of a recording; 
let recordingFlag = false; //set to true while recording
let bpm = 120;
var sequencers = [];
let globalPlaying = false; //set to true while playing globally
var cueIn = false; //if true, play metronome before recording
var metronome = false; //if true, play metronome in sync with pulse; if the app is not in play state and metronome is on, cue in before recording
var randomThemeOnPulse = false;
var playingCueIn = false;
var destinations = [];
var sources = [];
var matrixConnections = [];
var allKnobs = []; //contain all the knobs in the application
var recentlyPressedSpaceBar = false; //using this for debouncing
var recentlyPressedPlayButton = false;
var soloedSequencer = -1; //index of sequencer that is being soloed

// pulse event
var pulseState = false; //true when generating pulse
const pulse = new Event('pulse');

// create metronome listening event
createPulseMetronomeEvent()

// render
let playPauseButtonContext = null;
let stopButtonContext = null;
window.onload = function(){
    addSequencer(sequencersContainer, false)
    addControlPannel(controlPannel);
    loadNextTheme() 
}

// --------------------
// FUNCTION DEFINITIONS 

function loadNextTheme(){
    currentThemeIndex = (currentThemeIndex+1)%themes.length;
    let currentTheme = themes[currentThemeIndex];

    let root = document.documentElement;
    root.style.setProperty('--white', currentTheme['--white']);
    root.style.setProperty('--black', currentTheme['--black']);
    root.style.setProperty('--blacker', currentTheme['--blacker']);
    root.style.setProperty('--grey', currentTheme['--grey']);
    root.style.setProperty('--red', currentTheme['--red']);
    root.style.setProperty('--playing-color', currentTheme['--playing-color']);

    //draw again everything that is based on a canvas (knobs and some buttons)
    redrawCanvasBasedElements();
}

function redrawCanvasBasedElements(){
    if(currentThemeIndex>-1){
        let currentTheme = themes[currentThemeIndex];
        for(let i=0; i<allKnobs.length; i++){
            allKnobs[i].setProperty('colorFG', currentTheme['--white']) 
            allKnobs[i].setProperty('colorBG', currentTheme['--grey']) 
        }
    }else{
        let white = getComputedStyle(document.querySelector(':root')).getPropertyValue('--white');
        let grey = getComputedStyle(document.querySelector(':root')).getPropertyValue('--grey')
        for(let i=0; i<allKnobs.length; i++){
            allKnobs[i].setProperty('colorFG', white) 
            allKnobs[i].setProperty('colorBG', grey) 
        }
    }
    
    drawStopButton(stopButtonContext)
    if(!globalPlaying){
        drawPlayButtonNode(playPauseButtonContext, 60, 60)
    }else{
        drawPauseButtonNode(playPauseButtonContext, 60, 60)
    }
}

document.body.onkeydown = function(e){ // play/pause with spacebar
    if(e.keyCode == 32){
        if(!recentlyPressedSpaceBar){ 
            recentlyPressedSpaceBar = true;
            setTimeout(function(){ recentlyPressedSpaceBar = false }, 200)

            if(globalPlaying){
                drawPlayButtonNode(playPauseButtonContext, 60, 60)
                stop()
            }else{
                drawPauseButtonNode(playPauseButtonContext, 60, 60)
                play()
            }
        }
    }
}

function play(){
    if(!globalPlaying){
        //iterate over all the sequencers and play() them
        for(let i=0; i<sequencers.length; i++){
            sequencers[i].play();
        }
        globalPlaying = true;
        startPulse();
    }    
}

function pause(){
    if(globalPlaying){
        //iterate over all the sequencers and pause() them
        for(let i=0; i<sequencers.length; i++){
            sequencers[i].pause();
        }
        globalPlaying = false;
        stopPulse();
    }
}

function stop(){
    globalPlaying = false;
    //iterate over all the sequencers and pause() them
    for(let i=0; i<sequencers.length; i++){
        sequencers[i].stop();
    }
    
    stopPulse();
}

function setBpm(bpmValue){
    LOWER_LIMIT = 12;
    UPPER_LIMIT = 200;

    //limit bpm value within desired range
    if(bpmValue<LOWER_LIMIT){ bpmValue=LOWER_LIMIT }
    if(bpmValue>UPPER_LIMIT){ bpmValue=UPPER_LIMIT }

    bpm = bpmValue;
}

function generatePulse(startTime){
    if(globalPlaying){ document.dispatchEvent(pulse); }

    let thisPulse = Date.now();
    if(startTime!=null){ 
        thisPulse = startTime 
    }
    let nextPulse = thisPulse + 60/bpm;
    let waitTime = nextPulse-thisPulse;

    if(pulseState){
        setTimeout( function(){ generatePulse(nextPulse)}, waitTime*1000);
    }
}

function startPulse(){
    if(!pulseState){
        pulseState = true;
        generatePulse(null);
    }
}

function stopPulse(){
    pulseState = false;
}

function createPulseMetronomeEvent(){
    document.addEventListener('pulse', function (e) {
        if(metronome){
            cuein();
        }
    }, false);
}

function toggleMetronome(){
    metronome = !metronome;
}

function toggleRandomThemeOnMetronome(){
    randomThemeOnPulse = !randomThemeOnPulse;
    document.addEventListener('pulse', function (e) {
        if(randomThemeOnPulse){
            randomTheme();
            currentThemeIndex = -1;
            //redrawCanvasBasedElements();
        }
    }, false);
}
