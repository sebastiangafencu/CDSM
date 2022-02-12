const possibleSubdivisionValues = [1, 2, 3, 4, 5];

class step{
    constructor(stepDuration=5, bypassMatrix=false){
        //create
        this.bufferSource = audioContext.createBufferSource();
        this.gainNode = audioContext.createGain();
        this.importedAudioObject = null;

        //connect
        this.bufferSource.connect(this.gainNode);
        
        //initialize
        this.gainNode.gain.value = 0.75;
        this.tempGainValue = 0.75;
        this.stepDuration=stepDuration;
        this.mute = false;
        this.usingImportedAudio = false;
        this.playbackRate = 1;
        this.det = 0;
        this.seqDet = 0;
    }
    get _gain(){
        return this.gainNode.gain.value;
    }
    set _gain(value){
        //don't let the gain go out of the [0, 1] range
        if(value>1){value=1}
        if(value<0){value=0}
        this.gainNode.gain.value = value;
    }
    get _gainNode(){
        return this.gainNode;
    }
    set _gainNode(gainNode){
        this.gainNode = gainNode;
    }
    get _bufferData(){ //need it for debugging
        return this.bufferSource.buffer.getChannelData(0);
    }
    set _onToggleRecording(f){
        this.onToggleRecording = f;
    }
    get _onToggleRecording(){
        return this.onToggleRecording;
    }
    #killBufferCreateBuffer(saveBufferContent=true){
        //take the buffer from the old buffer source and put it in the new buffer source (or don't do that); connect the new buffer source to the gain node;
        var tempBuffer = this.bufferSource.buffer;
        this.bufferSource = audioContext.createBufferSource();
        if(saveBufferContent){ this.bufferSource.buffer = tempBuffer; } //if we just want to play the sample again we have to save the buffer. Otherwise if we want to re-record we HAVE to not assign the buffer yet.
        this.bufferSource.connect(this.gainNode);
    }
    detune(det){
        if(det<-24){ det = -24 }
        if(det>24){ det = 24}

        this.det = parseInt(det)
        this.updateDetune()
    }
    updateDetune(){
        this.playbackRate = Math.pow(Math.pow(2, 1/12), this.det + parseInt(this.seqDet)); //sum the sequencer master detune and the steps' detune
    }
    importAudio(){
        try{fileSelectorId.remove()}catch{}
        var fileSelector = document.createElement('input');
        fileSelector.id = "fileSelectorId"
        fileSelector.setAttribute('type', 'file');

        var selectDialogueLink = document.createElement('a');
        selectDialogueLink.setAttribute('href', '');
        selectDialogueLink.innerText = "Select File";
        document.body.appendChild(fileSelector)
        fileSelector.click()
        fileSelector.style.display = "none"
        let refStep = this;
        fileSelector.onchange = function(){
            refStep.usingImportedAudio = true;
            let url = URL.createObjectURL(fileSelector.files[0])
            refStep.importedAudioObject = new Audio(url);
            refStep.importedAudioObject.preservesPitch = false;
            refStep.importedAudioObject.preload = 'auto';
            
            refStep.bufferSource = audioContext.createMediaElementSource(refStep.importedAudioObject)
            refStep.bufferSource.connect(refStep._gainNode)

            fileSelectorId.remove()
        }
    }
    recordStep(){
        //don't let the user record into multiple steps at the same time
        if(!recordingFlag){
            this.usingImportedAudio = false;
            this.bufferSource = audioContext.createBufferSource()
            recordingFlag = true;
            this.#killBufferCreateBuffer(false);
            this.onToggleRecording();
            recordBuffer(this.stepDuration, this.bufferSource, this.onToggleRecording);
        }else{ //if user pressed ANY record button but the step is already recording, stop the recording
            recordingFlag = false; //setting this to false will cause the recordBuffer function to stop
        }
    }
    playStep(startTime=audioContext.currentTime, duration=this.stepDuration, overlap=false){
        if(this.usingImportedAudio && this.importedAudioObject!=null){ this.importedAudioObject.playbackRate = this.playbackRate; }
        if(!this.usingImportedAudio){  this.bufferSource.playbackRate.value = this.playbackRate; } //need to set it every time since it gets destroyed
        
        if(this.usingImportedAudio){
            this.importedAudioObject.currentTime = 0;
            this.importedAudioObject.play()
            this.started = true;

            if(!overlap){
                let refStep = this;
                setTimeout( function(){ refStep.importedAudioObject.pause() }, duration*1000-50)
            }
        }else{
            //schedule play and stop
            this.bufferSource.start(startTime);
            if(!overlap){
                this.bufferSource.stop(startTime+duration);
            }
            
            this.started = true;

            //schedule an envelope on the steps' gain to get rid of click sounds when it starts playing
            let temp = this._gain;
            this.gainNode.gain.setValueAtTime(0, startTime); //start envelope at 0
            this.gainNode.gain.setTargetAtTime(temp, startTime, 0.0001); //rise quickly
            if(!overlap){
                this.gainNode.gain.setTargetAtTime(0, startTime+duration-0.001, 0.0001); //at the end of the step, decay quickly to 0
                this.gainNode.gain.setValueAtTime(temp, startTime+duration); //reset the gain value for the next cycle
            }

            //the function inside the timeout will be executed in the window scope (the global scope). We need to pass a reference to the step object and this is what's happening here
            let refThis = this; 
            setTimeout(function(){ refThis.#killBufferCreateBuffer(true)}, 5);
        }
    }
    stop(){
        if(this.usingImportedAudio){
            this.importedAudioObject.pause();
        }
    }
    emptyStep(){
        this.#killBufferCreateBuffer(false);
    }
    isMuted(){
        return this.mute;
    }
    toggleMute(){
        this.mute = !this.mute; //toggle

        if(this._gain != 0 && this._gain!=this.tempGainValue){ // if the gain was changed while the step was muted
            this.tempGainValue = this._gain;
        }
        if(this.mute){
            this.tempGainValue = this._gain; //record gain value
            this._gain = 0; //mute step
        }else{
            this._gain = this.tempGainValue; //restore previous gain value
        }
    }
}

class sequencer{
    constructor(stepsNumber, bypassMatrix=false){
        //create global gain node and gain nodes array
        this.gainNode = audioContext.createGain();
        this.tempGainValue = 0.75;
        this.gainNode.gain.value = 0.75;
        this.stepsNumber= stepsNumber; 
        this.gainNode.connect( globalAppGain );
        this.seqDet = 0;    
        
        this.gainNodes = [];
        this.gainNodes.push(this.gainNode); //add global gain node as first element of gainNodes

        //check stepsNumber is within a reasonable range
        if( stepsNumber<1 ){ stepsNumber = 1; }
        if( stepsNumber>128 ){ stepsNumber = 128; }

        //initialize steps
        this.steps = [];

        this.gainNodePostEffect = []
        
        for(let i=0; i<stepsNumber; i++){ 
            this.addStep(); 
            this.gainNodePostEffect[i] = audioContext.createGain(); 
            this.gainNodePostEffect[i].value = 1; 
            this.gainNodePostEffect[i].connect(this.gainNode); 
        } 

        //initialize state
        this.removed = false; //true if was deleted by user
        this.playing = false;
        this.randomOrder = false;
        this.currentStep = 0; //index of current playing step
        this.subdivisionIndex = 1; //index relative to the possibleSubdivisionValues array
        this.eventListenerAdded = false;
        this.shuffleState = false; //true when user has pressed shuffle at least once
        this.shuffleOrder = []; //array that contains a generated shuffle order
        for(let i=0; i<this.steps.length; i++){ this.shuffleOrder.push(i) }
        this.shuffleCurrentStep = 0;
        this.mute = false;
        this.overlap = false; // if true, overlap the recordings/imported audios
        this.connections = [];
        this.initialized = false;
        this.playbackRate = 1;
        this.id = sequencers.length;
        
        this.initializeEffects()
        this.initializeConnectionsMatrix();

        //connect steps to seq gain
        for(let i=0; i<this._steps.length; i++){
            this.applyEffect(5, this._steps[i])
        }
    }
    get _steps(){
        return this.steps;
    }
    get _gainNodes(){
        return this.gainNodes;
    }
    get _id(){
        return this.id;
    }
    set _id(value){
        this.id = value;
    }
    get _currentStep(){
        return this.currentStep;
    }
    set _currentStep(t){
        this.currentStep = t;
    }
    detune(det){
        det = parseInt(det)
        if(det<-24){ det = -24 }
        if(det>24){ det = 24}

        this.seqDet = det

        //also sum detune to steps' detune
        for(let i=0; i<this._steps.length;i++){
            this._steps[i].seqDet = det;
            this._steps[i].updateDetune()
        }
    }
    initializeEffects(){
        this.delay = new Pizzicato.Effects.Delay({
            feedback: 0.5,
            time: 0.5,
            mix: 0.5
        });

        this.reverb = new Pizzicato.Effects.Reverb({
            time : 0.5,
            decay: 0.5,
            reverse: false,
            mix: 0.5
        });

        this.quadrafuzz = new Pizzicato.Effects.Flanger({
            time: 0.45,
            speed: 0.2,
            depth: 0.15,
            feedback: 0.2,
            mix: 1
        });

        this.stereoPanner = new Pizzicato.Effects.StereoPanner({
            pan: 0
        });

        this.ringModulator = new Pizzicato.Effects.LowPassFilter({
            frequency: 10000,
            peak: 10
        });

        this.effectsArray= []; 
        this.effectsArray.push(this.reverb); 
        this.effectsArray.push(this.delay); 
        this.effectsArray.push(this.quadrafuzz); 
        this.effectsArray.push(this.stereoPanner); 
        this.effectsArray.push(this.ringModulator); 
        this.effectsArray.push(this.gainNode); 
    }
    initializeConnectionsMatrix(){
        for(let effect=0; effect<this.effectsArray.length; effect++){
            let temp = new Array(this._steps.length).fill(0);
            this.connections.push(temp)
        }
    }
    eraseConnection(effect, stepSelected){
        this.connections[effect][this.steps.indexOf(stepSelected)] = 0; 
    }
    applyConnection(effect, stepSelected){
        this.connections[effect][this.steps.indexOf(stepSelected)] = 1; 
    }
    applyEffect(type, stepSelected){   
        this.applyConnection(type, stepSelected);
        var effectConnectedPost= this.countConnections(stepSelected);
        stepSelected.gainNode.connect(this.effectsArray[type]);

        if(type!=5){ //don't connect seq gain to itself
            this.effectsArray[type].connect(this.gainNodePostEffect[this.steps.indexOf(stepSelected)]);
        }
        
        this.gainNodePostEffect[this.steps.indexOf(stepSelected)].gain.value = 1 / effectConnectedPost; //normalize
    }
    countConnections(stepSelected){
        var effectConnected= 0; 

        for(var i = 0 ; i <this.effectsArray.length ; i++){
            effectConnected = this.connections[i][this.steps.indexOf(stepSelected)] + effectConnected; 
        }
        return effectConnected; 
    }
    disconnectEffect(type, stepSelected){
        type = parseInt(type)
        if(this.connections[type][this.steps.indexOf(stepSelected)] != 1){
            console.log("Effect wasn't connected");
        }else{
            var effectConnectedPre = this.countConnections(stepSelected); 
            this.eraseConnection(type, stepSelected);
            var effectConnectedPost = this.countConnections(stepSelected); 
            
            if(effectConnectedPost == 0){
                this.gainNodePostEffect[this.steps.indexOf(stepSelected)].gain.value = 1;
                stepSelected.gainNode.disconnect()
            }else{
                stepSelected.gainNode.disconnect() //disconnet step from all effects
                
                if(type!=5){
                    this.effectsArray[type].disconnect(this.gainNodePostEffect[this.steps.indexOf(stepSelected)]);
                }
                //re-connect step to effects
                for(var i = 0 ; i <this.effectsArray.length ; i++){ 
                    if(this.connections[i][this.steps.indexOf(stepSelected)] == 1){
                        this.steps[this.steps.indexOf(stepSelected)].gainNode.connect(this.effectsArray[i]);
                    }
                }   
                //normalize gain
                if(effectConnectedPost!=0){
                    this.gainNodePostEffect[this.steps.indexOf(stepSelected)].gain.value = parseFloat((this.gainNodePostEffect[this.steps.indexOf(stepSelected)].gain.value*effectConnectedPre)/effectConnectedPost); 
                }
            }
        }
    }
    disconnectAllEffects(stepSelected){
        for(var i = 0 ; i <this.effectsArray.length ; i++){
            this.connections[i][this.steps.indexOf(stepSelected)] = 0;  
        }
        stepSelected.gainNode.disconnect();
        stepSelected.gainNode.connect(this.gainNode);
    }
    toggleMute(){
        this.mute = !this.mute; //toggle

        if(this._gainNodes[0].gain.value != 0 && this._gainNodes[0].gain.value!=this.tempGainValue){ // if the gain was changed while the step was muted
            this.tempGainValue = this._gainNodes[0].gain.value;
        }
        if(this.mute){
            this.tempGainValue = this._gainNodes[0].gain.value; //record gain value
            this._gainNodes[0].gain.value = 0; //mute step
        }else{
            this._gainNodes[0].gain.value = this.tempGainValue; //restore previous gain value
        }
    }
    cycleSubdivision(){
        this.subdivisionIndex = (this.subdivisionIndex+1) % possibleSubdivisionValues.length;
    }
    turnOffAllSteps(refSeq){
        //get colors from css
        var root = document.querySelector(':root');
        let white = getComputedStyle(root).getPropertyValue('--white');
        
        for(let i=0; i<refSeq._steps.length; i++){
            //get previous step button and id node
            let stepButtonId = ""+refSeq._id+","+(i+1);
            let stepButton = document.getElementById(stepButtonId).children[1];
            let seqIdNode = document.getElementById(""+this._id+","+0);

            //turn off
            seqIdNode.children[1].style.color = white;
            stepButton.classList.remove("playing");

            //select led from matrix and turn it off
            let ledId = "led"+stepButtonId;
            let led = document.getElementById(ledId)
            led.classList.remove("playing")
        }
    }
    turnOnCurrentStep(){
        if(this.currentStep<this._steps.length){ //check if step still exists
            // get colors from css
            var root = document.querySelector(':root');
            let playingColor = getComputedStyle(root).getPropertyValue('--playing-color');

            // get step button and sequencer id node
            let stepButtonId = ""+this._id+","+(this.currentStep+1);
            let stepButton = document.getElementById(stepButtonId).children[1];
            let seqIdNode = document.getElementById(""+this._id+","+0);
            // turn on
            seqIdNode.children[1].style.color = playingColor;

            stepButton.classList.add("playing");

            //select led from matrix and turn it on
            let ledId = "led"+stepButtonId;
            let led = document.getElementById(ledId)
            led.classList.add("playing")
        }
    }
    scheduleBlinking(){
        var dutyCycle = 0.4; //blinking duty cycle
        var onDuration = dutyCycle*60*1000/(bpm*possibleSubdivisionValues[this.subdivisionIndex]);

        this.turnOnCurrentStep(); // turn on
        let refSeq = this;
        setTimeout( function(){refSeq.turnOffAllSteps(refSeq)}, onDuration); // schedule turn off
    }
    play(){
        if(!this.removed){
            //play a new step with a frequency related to the bpm
            this.playing = true;
            
            //add event if it was not already added
            if(!this.eventListenerAdded){
                //everytime a pulse is generated, schedule playing of steps(multiple steaps per pulse can be played due to the subdivisions)
                let refSeq = this;
                document.addEventListener('pulse', function (e) {
                    var duration = 60/(bpm*possibleSubdivisionValues[refSeq.subdivisionIndex]);
                    for(let i=0; i<possibleSubdivisionValues[refSeq.subdivisionIndex]; i++){
                        setTimeout( function(){ refSeq.playNextStep() }, 1000*duration*i);
                    }
                }, false);

                this.eventListenerAdded = true;
            }
        }
    }
    playNextStep(){
        this.scheduleBlinking();
        //check if still in playing state
        if(this.playing){
            var duration = 60/(bpm*possibleSubdivisionValues[this.subdivisionIndex]); //need to compute duration every time as bpm may have changed meanwhile

            if(this.currentStep>=this.steps.length || this.currentStep<0){ this.currentStep = 0;} //if the next step to be played was deleted, reset the currentStep to 0
            if(this._steps.length==0){ this.pause() }; //pause if there are no steps to play

            try{
                this.steps[this.currentStep].playStep(audioContext.currentTime, duration, this.overlap); //play step
            }catch(error){
                this.currentStep = 0;
            }
            
            //store previous step in order to toggle its 'playing' class later
            this.previousStep = this.currentStep;

            //compute next step to play
            if(this.randomOrder){
                let r = null;
                do{
                    r = Math.floor(Math.random() * this.steps.length);
                }while(r==this.currentStep)
                this.currentStep = r;
            }else if(this.shuffleState){
                this.shuffleCurrentStep = (this.shuffleCurrentStep+1) % this.shuffleOrder.length;
                this.currentStep = this.shuffleOrder[this.shuffleCurrentStep];
            }else{
                this.currentStep = (this.currentStep+1) % this.steps.length;
            }
        }
    }
    toggleOverlap(){
        this.overlap = !this.overlap;
    }
    stop(){
        this.playing = false;
        this.currentStep = 0;
        if(this.overlap){
            for(let i=0; i<this._steps.length-1; i++){
                this._steps[i].stop();
            }
        }
    }
    pause(){
        this.playing = false;
        if(this.overlap){
            for(let i=0; i<this._steps.length-1; i++){
                this._steps[i].stop();
            }
        }
    }
    addStep(){
        //create step, add it to the steps array, add its gainNode to the gainNodes array and connect it to the global gainNode
        var s = new step(); 
        this.steps.push(s);
        this.gainNodes.push(s._gainNode);

        //insert it randomly in shuffleOrder, if it exists
        if(!(typeof this.shuffleOrder === 'undefined' || this.shuffleOrder === null)){
            this.shuffleOrder.splice(Math.floor(Math.random() * (this.shuffleOrder.length-1)), 0, this.steps.length-1);
        }

        if(this.initialized){
            this.increaseConnectionMatrix();
            var gainNodePost = audioContext.createGain(); 
            this.gainNodePostEffect.push(gainNodePost);
            this.gainNodePostEffect[this.gainNodePostEffect.length-1].connect(this.gainNode);
            this.stepsNumber++;
            this.applyEffect(5, s)
        }

        //detune
        s.seqDet = this.seqDet; 
        s.updateDetune()
    }
    removeStep(){
        if(this.steps.length>1){
            let N = this._steps.length-1;
            //remove last step (indexing starts from 0).
            this.steps.splice(N,1);
            //remove its gain from gainNodes
            this.gainNodes.splice(N+1,1);
            //remove from shuffleOrder
            this.shuffleOrder.splice(this.shuffleOrder.indexOf(N), 1);
            this.reduceConnectionMatrix(); 

            this.stepsNumber--; 

            this.gainNodePostEffect.pop(this.gainNodePostEffect[this.gainNodePostEffect.length - 1]);
            this.gainNodePostEffect[this.gainNodePostEffect.length-1].disconnect();
        }
    }
    toggleRandomOrder(){
        this.randomOrder = !this.randomOrder;
    }
    shuffle(){
        this.randomOrder = false;
        this.shuffleState = true;
        this.shuffleOrder = [];
        this.shuffleCurrentStep = 0;
        this.currentStep = 0;
        for(let i=0; i<this.steps.length; i++){ this.shuffleOrder.push(i) }
        this.shuffleOrder = this.shuffleOrder.map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value); //got it from stack overflow :)
    }
    reduceConnectionMatrix(){
        // remove step
        for(let effect = 0 ; effect < this.effectsArray.length ; effect++){
            this.connections[effect].pop(); 
        }

    }
    increaseConnectionMatrix(){
        for(let effect = 0 ; effect < this.effectsArray.length ; effect++){
            this.connections[effect].push(0); 
        }
    }
    setRevDecayValue(val){
        this.reverb.decay = val ; 
    }
    setRevMixValue(val){
        this.reverb.mix = val;  
    }
    setRevTimeValue(val){
        this.reverb.time = val;  
    }
    setDelayTimeValue(val){
        this.delay.time = val;  
    }
    setDelayFeedbackValue(val){
        this.delay.feedback = val;  
    }
    setDelayMixValue(val){
        this.delay.mix = val;
    }
    setFuzzLowValue(val){
        this.quadrafuzz.speed = val;
        this.quadrafuzz.depth = val;  
    }
    setFuzzHighValue(val){
        this.quadrafuzz.mix = val;
    }
    setPanValue(val){
        this.stereoPanner.pan = val; 
    }
    setRingSpeedValue(val){
        this.ringModulator.speed = val;  
    }
    setFilterFreqValue(val){
        this.ringModulator.frequency = val; 
    }
    setFilterPeakValue(val){
        this.ringModulator.peak = val;
    }
}