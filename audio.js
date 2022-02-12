function toggleMicMonitor(){
    /*
        This lets you monitor your microphone input. Expect a disgusting amount of latency.
    */
    try{
        micMonitor = !micMonitor; //toggle
        if(micMonitor){
            micInputSource.connect(globalAppGain);
        }else{
            micInputSource.disconnect(globalAppGain);
        }
    }catch{
        toggleMicMonitor();
    }
    
}

function playBuffer(bufferObject){
    bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = bufferObject;
    bufferSource.connect(audioContext.destination);
    bufferSource.start();
    bufferSource.stop(audioContext.currentTime+bufferObject.duration);
}

function createEmptyBuffer(){
    return audioContext.createBuffer(1, 1, audioContext.sampleRate);
}

function recordBuffer(duration, bufferSource, f){
    /*
        f is a function to call when recording stops
        Record from microphone into the buffer of the buffer source node "bufferSource" for "duration" seconds.
    */
    scriptProcessorBufferSize = 16384; //must be power of 2 between 256 and 16384

    //compute number of samples to record
    samplesToRecord = audioContext.sampleRate*duration;
    recordedSamples = 0;

    //create a buffer
    bufferObject = audioContext.createBuffer(1, samplesToRecord, audioContext.sampleRate);
    bufferSource.buffer = bufferObject;
    bufferArray = bufferObject.getChannelData(0);
    
    //script processor
    const processor = audioContext.createScriptProcessor(scriptProcessorBufferSize, 1, 1);
    micInputSource.connect(processor);
    processor.connect(audioContext.destination);

    //this event is emitted when the buffer is filled
    let first = true; 
    let N = 50;
    processor.onaudioprocess = function(e) {
        if(recordingFlag && recordedSamples<samplesToRecord ){ //if there are still samples AND user has not stopped the recording
            //compute remaining number of samples; this is necessary in order to not write out of the array's boundary
            remainingSamples = samplesToRecord-recordedSamples;
            if(remainingSamples>scriptProcessorBufferSize){ 
                remainingSamples = scriptProcessorBufferSize;
            }

            inputBufferArray = e.inputBuffer.getChannelData(0);

            if(first){ 
                //remove the first DELAYCOMPENSATION samples
                var temp = Array.from(inputBufferArray);
                temp.splice(0, DELAYCOMPENSATION);
                inputBufferArray = new Float32Array(temp);
                remainingSamples -= DELAYCOMPENSATION;
                
            }

            for(let i=0; i<remainingSamples; i++){
                bufferArray[i+recordedSamples] = inputBufferArray[i];
            }
            recordedSamples+=remainingSamples;

            //apply start envelope 
            if(first){
                first = false;
                for(let i=0; i<N; i++){
                    bufferArray[i] = bufferArray[i]*(i/50);
                }
            }
        }else{ //bufferObject is full or we're not recording anymore
            //apply end envelope
            for(let i=0; i<N; i++){
                bufferArray[recordedSamples-i] = bufferArray[recordedSamples-i]*(i/50);
            }
            //disconnect the processor so it stops recording
            micInputSource.disconnect();
            processor.disconnect();
            recordingFlag = false;
            if(micMonitor){toggleMicMonitor()}
            f();
        }
    };
}

function startRecordingGlobalAudio(){
    rec.clear();
    rec.record();
}

function stopRecordingGlobalAudio(){
    //stop recording and then force the download of the wav file
    rec.stop();
    rec.exportWAV(forceDownload);
}

function forceDownload(blob) {
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var link = window.document.createElement('a');
    link.href = url;
    link.download = 'output.wav';
    link.click()
}

function cuein() {
    o = audioContext.createOscillator()
    g = audioContext.createGain(); 
    // gain envelope to avoid clicking
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.4, audioContext.currentTime, 0.005); 
    g.gain.setTargetAtTime(0, audioContext.currentTime+0.015, 0.003);
    o.connect(g)
    g.connect(globalAppGain)
    var bps= bpm/60
    var duration = 1000/bps
    o.start(audioContext.currentTime)
    o.stop(audioContext.currentTime+0.03)
}

function playtempo(numberOfBeeps=4, callbackFunction) {
    playingCueIn = true;
    var bps= bpm/60
    var duration = 1000/bps
    for(let i=0; i<numberOfBeeps; i++){
        setTimeout(cuein, duration*i)
    }
    setTimeout( function(){callbackFunction(); playingCueIn=false; }, duration*numberOfBeeps); //after the cue in, run the callback function
}