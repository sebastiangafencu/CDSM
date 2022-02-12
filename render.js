function addSequencer(node, bypassMatrix=false){ 
    //create sequencer, render it 'node' (html node), set bypassMatrix to true to plug the sequencer into the output
    let seq = new sequencer(4, bypassMatrix)
    sequencers.push(seq);
    renderSequencer(sequencers[sequencers.length-1], node)
    if(globalPlaying){
        seq.play()
    }
}

function removeLastSequencer(){
    let lastSeqId = sequencers.length-1;
    while(lastSeqId>=0 && sequencers[lastSeqId].removed){
        lastSeqId--;
    }
    
    if(lastSeqId>-1){ //if there is a sequencer to remove
        document.getElementById("sequencer"+lastSeqId).parentElement.remove()
        sequencers[lastSeqId].stop()
        sequencers[lastSeqId].removed = true;
    }
}

function renderGainKnob(parentNode){
    //create knob
    let gainKnob = pureknob.createKnob(60, 60);
    allKnobs.push(gainKnob);
    gainKnob.setProperty('trackWidth', 0.15);
    gainKnob.setValue(75)
    gainKnob.setProperty('angleStart', -0.75 * Math.PI)
    gainKnob.setProperty('angleEnd', 0.75 * Math.PI)
    
    //get color from css variable
    let root = document.querySelector(':root'); 
    let white = getComputedStyle(root).getPropertyValue('--white');
    let grey = getComputedStyle(root).getPropertyValue('--grey');
    gainKnob.setProperty('colorFG', white) 
    gainKnob.setProperty('colorBG', grey) 
    
    //append to parent node
    let gainKnobNode = gainKnob.node()
    gainKnobNode.setAttribute("title", "set gain value");
    parentNode.classList.add("clickable")
    parentNode.appendChild(gainKnobNode)

    //add a listener to handle the changes of the knob value
    gainKnob.addListener(function(knob, value){
        args = knob._div.parentElement.id.split(',');
        gn = sequencers[parseInt(args[0])]._gainNodes[parseInt(args[1])];
        gn.gain.value = value / 100;
        //if user changes the gain of a muted step, call toggleMute() on it
        if(args[1]>0){ //user modified a step gain and not a global sequencer gain
            s = sequencers[parseInt(args[0])]._steps[parseInt(args[1])-1];
            if(s.isMuted()){
                s.toggleMute();
                gn.gain.value = value / 100;
                ref = document.getElementById(knob._div.parentElement.id).children[1];
                ref.classList.toggle("muted");
            }
        }
    });
}

function renderGlobalAppGainKnob(parentNode){
    //create knob
    let gainKnob = pureknob.createKnob(60, 60);
    allKnobs.push(gainKnob);
    gainKnob.setProperty('trackWidth', 0.15);
    gainKnob.setValue(75)
    gainKnob.setProperty('angleStart', -0.75 * Math.PI)
    gainKnob.setProperty('angleEnd', 0.75 * Math.PI)
    
    //get color from css variable
    let root = document.querySelector(':root'); 
    let white = getComputedStyle(root).getPropertyValue('--white');
    let grey = getComputedStyle(root).getPropertyValue('--grey');
    gainKnob.setProperty('colorFG', white) 
    gainKnob.setProperty('colorBG', grey) 
    
    //append to parent node
    let gainKnobNode = gainKnob.node()
    gainKnobNode.setAttribute("title", "set global gain value");
    gainKnobNode.classList.add("clickable")
    parentNode.appendChild(gainKnobNode)

    //add a listener to handle the changes of the knob value
    gainKnob.addListener(function(knob, value){
        globalAppGain.gain.linearRampToValueAtTime(value/100, 0.1)
    });
}

function renderStep(step, parentNode, sequencerId, stepId){
    //Define the properties of the step container and attach it the DOM as a child of the 'node'
    stepContainerNode = document.createElement("div")
    stepContainerNode.classList.add("stepContainer")
    //set as id for the step container a string of two numbers separated by a comma: the first number is the sequencer's id, the second one is the position in the sequencers' gainNodes array of the gain that the step containers contains
    idStr = "" + sequencerId + "," + (stepId+1) 

    stepContainerNode.setAttribute("id", idStr)

    //select last step of current sequencer in order to insert the new step after it
    lastStepId = ""+sequencerId+","+stepId;
    lastStep = document.getElementById(lastStepId);

    //add to dom
    lastStep.after(stepContainerNode);

    renderGainKnob(stepContainerNode)
    renderCentralButton(step, stepContainerNode)
    renderRecButton(step, stepContainerNode)

    //import button
    importButtonNode = document.createElement("div")
    importButtonNode.classList.add("letterButton")
    importButtonNode.classList.add("importButton")
    importButtonNode.title = "click to import a sample"
    importButtonNode.classList.add("clickable")
    importButtonNode.innerHTML = "import"
    stepContainerNode.appendChild(importButtonNode)
    let refStep = step;
    importButtonNode.onclick = function(){
        refStep.importAudio();
    }

    //detune input box
    detuneBox = document.createElement("input")
    detuneBox.classList.add("bpmInputBox")
    detuneBox.classList.add("detuneBox")
    detuneBox.title = "pitch shift"
    detuneBox.type = "number"
    detuneBox.value = 0
    detuneBox.step = 1
    detuneBox.min = -24
    detuneBox.max = 24
    let refDetuneBox = detuneBox;
    detuneBox.onclick = function(){
        refDetuneBox.select()
    }
    detuneBox.onchange = function(){
        refStep.detune(refDetuneBox.value)
    }
    stepContainerNode.appendChild(detuneBox)
}

function renderCentralButton(step, parentNode){
    //create square button
    centralButton = document.createElement("div")
    centralButton.innerHTML = parentNode.id.split(',')[1]-1;
    centralButton.classList.add("stepCentralButton")
    centralButton.setAttribute("title", "press to mute/unmute")
    
    //appent to parent node
    parentNode.appendChild(centralButton)

    //define function to call when start recording when user plays the record button
    let ref = centralButton;
    step._onToggleRecording = function(){ ref.classList.toggle("recording")}

    //pressing the step button makes it toggle between muted and not muted
    centralButton.onclick = function(){ step.toggleMute(); ref.classList.toggle("muted"); }
}

function renderRecButton(step, parentNode){
    recButton = document.createElement("div")
    recButton.classList.add("stepRecButton")
    recButton.setAttribute("title", "press to start recording, press again or wait to stop recording")
    parentNode.appendChild(recButton)

    recButton.onclick = function(){
        if(metronome){ //if metronome is on, sync recording with tempo
            if(globalPlaying){ //in playing state, start recording on the next pulse
                if(!recordingFlag){
                    var f = function(e){ step.recordStep(); document.removeEventListener('pulse', f); }
                    document.addEventListener('pulse', f , false);
                }else{
                    recordingFlag = false;
                }
            }else{ //in pause state, play a couple of beeps before recording
                if(recordingFlag){ // if user presses the button again during recording phase, stop the recording
                    recordingFlag = false;
                }else if(playingCueIn){ // if user presses again during the cue in part
                    // do nothing
                }else{ // not recording, not playing cue in
                    let refStep = step;
                    playtempo(4, function(){
                        refStep.recordStep();
                    });
                }
            }
        }else{ //if metronome is off, start recording right immediately
            step.recordStep();
        }
    }
}

function renderSequencer(sequencer, node){
    var finalContainer = document.createElement("div"); 
    var generalContainer = document.createElement("div"); 
    generalContainer.classList.add("generalContainer");
    sequencerContainer = document.createElement("div")
    sequencerContainer.classList.add("sequencer")
    sequencerContainer.setAttribute("id", "sequencer"+sequencer._id);
    generalContainer.appendChild(sequencerContainer); 

    renderMatrix(sequencer, generalContainer); 

    //DIV FOR SEQUENCER + MATRIX
    finalContainer.appendChild(generalContainer);
    node.appendChild(finalContainer);
    
    //first column
    sequencerRightColumn = document.createElement("div")
    sequencerRightColumn.classList.add("stepContainer")
    sequencerRightColumn.classList.add("sequencerRightColumn")
    sequencerRightColumnNode = sequencerContainer.appendChild(sequencerRightColumn)

    //sequencer title input box
    seqNameBox = document.createElement("input")
    seqNameBox.classList.add("bpmInputBox")
    seqNameBox.classList.add("sequencerName")
    seqNameBox.title = "click to name this sequencer"
    seqNameBox.value = "label"
    let refSeqNameBox = seqNameBox;
    seqNameBox.onclick = function(){
        refSeqNameBox.select()
    }
    sequencerRightColumnNode.appendChild(seqNameBox)

    //add step
    addStep = document.createElement("div")
    addStep.classList.add("stepContainer")
    addStep.classList.add("letterButton")
    addStep.classList.add("clickable")
    addStep.setAttribute("title", "add new step to sequencer")
    addStep.innerHTML = '+'
    sequencerRightColumnNode.appendChild(addStep)
    let refSequencer = sequencer; 
    let refSequencerContainer = sequencerContainer;
    addStep.onclick = function(){ 
        refSequencer.addStep(); 
        renderStep(refSequencer._steps[refSequencer._steps.length-1], refSequencerContainer, refSequencer._id, refSequencer._steps.length-1) 
        generalContainer.removeChild(generalContainer.lastChild)
        renderMatrix(refSequencer, generalContainer);
    }

    //delete step
    deleteStep = document.createElement("div")
    deleteStep.classList.add("stepContainer")
    deleteStep.classList.add("letterButton")
    deleteStep.classList.add("clickable")
    deleteStep.setAttribute("title", "remove last step")
    deleteStep.innerHTML = '-'
    sequencerRightColumnNode.appendChild(deleteStep)
    deleteStep.onclick = function(){ 
        // don't do anything if there is less than two steps left
        if(refSequencer._steps.length > 1){
            // remove step container that contains deleted step
            lastStepId = ""+refSequencer._id+","+(refSequencer._steps.length);
            lastStep = document.getElementById(lastStepId);
            lastStep.remove();
            refSequencer.removeStep(refSequencer._steps.length); 
            generalContainer.removeChild(generalContainer.lastChild)
            renderMatrix(refSequencer, generalContainer);
        }
    }

    //shuffle
    shuffleButton = document.createElement("div")
    shuffleButton.classList.add("stepContainer")
    shuffleButton.classList.add("letterButton")
    shuffleButton.classList.add("clickable")
    shuffleButton.setAttribute("title", "shuffle steps once")
    shuffleButton.innerHTML = 'S'
    sequencerRightColumnNode.appendChild(shuffleButton)
    shuffleButton.onclick = function(){
        refSequencer.shuffle();
    }

    //random order
    randomOrderButton = document.createElement("div")
    randomOrderButton.classList.add("stepContainer")
    randomOrderButton.classList.add("letterButton")
    randomOrderButton.classList.add("clickable")
    randomOrderButton.style.color="var(--white)"
    randomOrderButton.setAttribute("title", "toggle random order")
    randomOrderButton.innerHTML = 'R'
    sequencerRightColumnNode.appendChild(randomOrderButton)
    let refRandomOrderButton = randomOrderButton;
    randomOrderButton.onclick = function(){
        refSequencer.toggleRandomOrder();
        if(refRandomOrderButton.style.color=="var(--white)"){
            refRandomOrderButton.style.color="var(--red)"
        }else{
            refRandomOrderButton.style.color="var(--white)"
        }
    }
    
    //subdivision
    cycleSubdivisionButton = document.createElement("div")
    cycleSubdivisionButton.classList.add("letterButton")
    cycleSubdivisionButton.classList.add("cycleSubdivisionButton");
    cycleSubdivisionButton.classList.add("clickable")
    cycleSubdivisionButton.setAttribute("title", "cycle between subdivisions for this sequencer")
    cycleSubdivisionButton.innerHTML = 'sub:1/2'
    sequencerRightColumnNode.appendChild(cycleSubdivisionButton)
    let refCycleSubdivisionButton = cycleSubdivisionButton;
    cycleSubdivisionButton.onclick = function(){
        refSequencer.cycleSubdivision();
        let selectedSubdivision = possibleSubdivisionValues[refSequencer.subdivisionIndex];
        if(selectedSubdivision==0.5){
            selectedSubdivision = "2"
        }else if(selectedSubdivision==1){
            selectedSubdivision = "1"
        }else{
            selectedSubdivision = "1/"+selectedSubdivision;
        }
        refCycleSubdivisionButton.innerHTML = "sub:"+selectedSubdivision;
    }
    
    //solo
    soloButton = document.createElement("div")
    soloButton.classList.add("letterButton")
    soloButton.classList.add("clickable")
    soloButton.classList.add("soloButton")
    soloButton.style.fontSize = "13px"
    soloButton.style.marginTop = "5px"
    soloButton.setAttribute("title", "solo sequencer")
    soloButton.innerHTML = "solo"
    sequencerRightColumnNode.appendChild(soloButton)
    let refSoloButton = soloButton;
    soloButton.onclick = function(){
        // turn off all solo buttons except this one
        let allSoloButtons = document.getElementsByClassName("soloButton")

        for(let i=0; i<allSoloButtons.length; i++){
            allSoloButtons[i].classList.remove("activated")
        }
        refSoloButton.classList.add("activated")


        let allSeqs = document.getElementsByClassName("sequencer")
        if(soloedSequencer==sequencer._id){ //if user clicked solo on a sequencer that's not already soloed
            // unmute all the sequencers
            soloedSequencer = -1
            
            refSoloButton.classList.remove("activated")

            // render unmuted and unmute every sequencer
            for(let i=0; i<allSeqs.length; i++){
                allSeqs[i].classList.remove("mutedSeq") //render all sequencers unmute

                let seqId = allSeqs[i].id.substring(9);
                if(sequencers[seqId].mute){ sequencers[seqId].toggleMute()}
            }

            // render every mute button deactivated
            let allMuteButtons = document.getElementsByClassName("muteButton") //render all mute buttons deactivated
            for(let i=0; i<allMuteButtons.length;i++){
                allMuteButtons[i].classList.remove("activated")
            }
        }else{
            soloedSequencer = sequencer._id;
            if(sequencers[sequencer._id].mute){ sequencers[sequencer._id].toggleMute() } //unmute if mute

            for(let i=0; i<allSeqs.length; i++){
                if(i!=sequencer._id){ //don't mute the sequencer that the user is soloing
                    allSeqs[i].classList.add("mutedSeq") // render all the the other sequencers muted

                    // mute all the other sequencers
                    let seqId = allSeqs[i].id.substring(9);
                    if(!sequencers[seqId].mute){ sequencers[seqId].toggleMute()}
                }else{
                    //render soloed sequencer unmute if rendered mute
                    allSeqs[i].classList.remove("mutedSeq")
                }
            }
        }
    }

    //show matrix
    showMatrix = document.createElement("div");
    showMatrix.title = "open/close matrix"
    showMatrix.innerHTML = "MATRIX"; 
    sequencerRightColumnNode.appendChild(showMatrix);
    showMatrix.classList.add("letterButton"); 
    showMatrix.classList.add("clickable"); 
    showMatrix.classList.add("showMatrixButton");
    showMatrix.onclick = function(){
        //get matrix
        let m = document.getElementById("matrix"+refSequencer._id);
        if(m.classList.contains("notShowing")){
            m.classList.remove("notShowing")
        }else{
            m.classList.add("notShowing")
        }
    }

    //second column
    sequencerLeftColumn = document.createElement("div")
    sequencerLeftColumn.classList.add("stepContainer")
    sequencerLeftColumn.classList.add("sequencerLeftColumn")
    sequencerLeftColumnNode = sequencerContainer.appendChild(sequencerLeftColumn) //add to dom
    
    //seq id
    idStr = "" + sequencer._id + "," + 0
    sequencerLeftColumn.setAttribute("id", idStr)
    
    //sequencer gain knob
    renderGainKnob(sequencerLeftColumnNode)
    
    //display sequencers' id
    sequencerId = document.createElement("div")
    sequencerId.classList.add("letterButton")
    sequencerId.innerHTML = sequencer._id
    sequencerId.setAttribute("title", "sequencer's name")
    sequencerIdNode = sequencerLeftColumnNode.appendChild(sequencerId)

    //overlap button
    overlapButton = document.createElement("div")
    overlapButton.classList.add("letterButton")
    overlapButton.classList.add("overlapButton")
    overlapButton.style.color = "var(--white)";
    overlapButton.innerHTML = "overlap"
    overlapButton.setAttribute("title", "click to turn on/off overlap")
    let refOverlapButton = overlapButton
    overlapButton.onclick = function(){
        if(refOverlapButton.style.color=="var(--white)"){
            refOverlapButton.style.color ="var(--red)";
        }else{
            refOverlapButton.style.color = "var(--white)";
        }
        refSequencer.toggleOverlap();
    }
    sequencerLeftColumnNode.appendChild(overlapButton)
    
    //mute button
    muteButton = document.createElement("div")
    muteButton.classList.add("letterButton")
    muteButton.classList.add("clickable")
    muteButton.classList.add("muteButton")
    muteButton.style.fontSize = "13px"
    muteButton.style.marginTop = "10px"
    muteButton.setAttribute("title", "mute sequencer")
    muteButton.innerHTML = "mute"
    sequencerLeftColumnNode.appendChild(muteButton)
    let refMuteButton = muteButton;
    muteButton.onclick = function(){
        refSequencer.toggleMute();
        if(refSequencer.mute){
            refSequencerContainer.classList.add("mutedSeq")
            refMuteButton.classList.add("activated")
        }else{
            refSequencerContainer.classList.remove("mutedSeq")
            refMuteButton.classList.remove("activated")
        }
    }

    //global seq detune
    detuneBox = document.createElement("input")
    detuneBox.classList.add("bpmInputBox")
    detuneBox.classList.add("detuneBox")
    detuneBox.title = "sequencer pitch shift"
    detuneBox.type = "number"
    detuneBox.value = 0
    detuneBox.step = 1
    detuneBox.min = -24
    detuneBox.max = 24
    let refDetuneBox = detuneBox;
    detuneBox.onclick = function(){
        refDetuneBox.select()
    }
    detuneBox.onchange = function(){
        refSequencer.detune(refDetuneBox.value)
    }
    sequencerLeftColumnNode.appendChild(detuneBox)

    //render steps
    for(let i = 0; i <(sequencer._steps).length; i++){
        renderStep(sequencer._steps[i], sequencerContainer, sequencer._id, i)
    }
    
    refSequencer.initialized = true;  
}

function sanVaTheme(){
    //easter egg
    document.documentElement.style.setProperty('--white', '#FFDEE3');
    document.documentElement.style.setProperty('--black', '#C00000');
    document.documentElement.style.setProperty('--blacker', '#FF3334');
    document.documentElement.style.setProperty('--grey', '#FFBBC1');
    document.documentElement.style.setProperty('--red', '#FF6F77');
    document.documentElement.style.setProperty('--playing-color', '#aa3fed');

    document.body.style.cursor = 'url(https://c.tenor.com/SobspNWmkYcAAAAi/heart-glittery.gif), auto';
}

function randomTheme(){
    document.documentElement.style.setProperty('--white', randomColor());
    document.documentElement.style.setProperty('--black', randomColor());
    document.documentElement.style.setProperty('--blacker', randomColor());
    document.documentElement.style.setProperty('--grey', randomColor());
    document.documentElement.style.setProperty('--red', randomColor());
    document.documentElement.style.setProperty('--playing-color', randomColor());
}

function randomColor() {
    return "#" + ((1<<24)*Math.random() | 0).toString(16);
}

function renderMatrix(sequencer, node){
    // create matrix container
    var matrix = document.createElement("div"); 
    matrix.classList.add("matrixContainer");
    matrix.classList.add("notShowing");
    matrix.id = "matrix"+sequencer._id
    columns = document.createElement("div"); // contains the parameters container and another container for all the matrix's columns
    columns.classList.add("columns")

    var effectContainer = [];
    var globalKnobContainer = document.createElement("div")
    var knobContainer = [];
    var effects = [];
    var knobContainerParam = []; 
    for(var effect = 0 ; effect< sequencer.effectsArray.length -1; effect ++){
        effectContainer[effect]  = document.createElement("div")
        effectContainer[effect].classList.add("effectNameAndParametersContainer")
        effects[effect]  = document.createElement("div")
        knobContainer[effect] = document.createElement("div");
        
        effects[effect].classList.add("effectName");
        effects[effect].innerHTML = effectsName[effect];
        effectContainer[effect].title = effectsName[effect]+" parameters"

        effectContainer[effect].appendChild(effects[effect]);
        effectContainer[effect].appendChild(knobContainer[effect]);  
        
        globalKnobContainer.appendChild(effectContainer[effect])
    }

    // step direct connection
    directConnection = document.createElement("div")
    directConnection.innerHTML = "DIRECT OUT<br> CONNECTION"
    directConnection.classList.add("directOutConnection")
    globalKnobContainer.appendChild(directConnection)
    var column1 = document.createElement("div");
    column1.appendChild(globalKnobContainer)
    var column2 = document.createElement("div");
    columns.appendChild(column1);
    columns.appendChild(column2);
    matrix.append(columns);
    
    
    // create all the knob containers, 3 for every effect
    for(var i_effect = 0 ; i_effect< 12 ; i_effect ++){
        knobContainerParam[i_effect]  = document.createElement("div");
    }

    // ----------------REVERB-----------------//
    renderEffectKnob( knobContainerParam[0], sequencer, 0, 0);
    appendParamName(knobContainerParam[0], "DAMP")

    renderEffectKnob( knobContainerParam[1], sequencer, 0, 1);
    appendParamName(knobContainerParam[1], "MIX")

    renderEffectKnob( knobContainerParam[2], sequencer, 0, 2);
    appendParamName(knobContainerParam[2], "TIME")

    knobContainer[0].classList.add("effectParametersContainer");
    knobContainer[0].appendChild(knobContainerParam[0]);
    knobContainer[0].appendChild(knobContainerParam[2]);
    knobContainer[0].appendChild(knobContainerParam[1]);
    
    // ----------------DELAY-----------------//
    renderEffectKnob( knobContainerParam[3], sequencer, 1, 0);
    appendParamName(knobContainerParam[3], "TIME")

    renderEffectKnob( knobContainerParam[4], sequencer, 1, 1);
    appendParamName(knobContainerParam[4], "FEED")

    renderEffectKnob( knobContainerParam[5], sequencer, 1, 2);
    appendParamName(knobContainerParam[5], "MIX")

    knobContainer[1].classList.add("effectParametersContainer");
    knobContainer[1].appendChild(knobContainerParam[3]);
    knobContainer[1].appendChild(knobContainerParam[4]);
    knobContainer[1].appendChild(knobContainerParam[5]);
    
    // ----------------FLANGER-----------------//
    renderEffectKnob( knobContainerParam[6], sequencer, 2, 0);
    appendParamName(knobContainerParam[6], "DEPTH")

    renderEffectKnob( knobContainerParam[7], sequencer, 2, 1);
    appendParamName(knobContainerParam[7], "MIX")

    knobContainer[2].classList.add("effectParametersContainer");
    knobContainer[2].appendChild(knobContainerParam[6]);
    knobContainer[2].appendChild(knobContainerParam[7]);
    
    // ----------------PAN-----------------//
    renderEffectKnob( knobContainerParam[8], sequencer, 3, 0);
    appendParamName(knobContainerParam[8], "PAN")
    
    knobContainer[3].classList.add("effectParametersContainer");
    knobContainer[3].appendChild(knobContainerParam[8]);
    
    // ----------------LPF-----------------//
    renderEffectKnob( knobContainerParam[9], sequencer, 4, 0);
    appendParamName(knobContainerParam[9], "FREQ")

    renderEffectKnob( knobContainerParam[10], sequencer, 4, 1);
    appendParamName(knobContainerParam[10], "PEAK")

    knobContainer[4].classList.add("effectParametersContainer");
    knobContainer[4].appendChild(knobContainerParam[9]);
    knobContainer[4].appendChild(knobContainerParam[10]);

    // ----------------END-----------------//
    
    renderInnerMatrix(column2, sequencer);
    
    node.appendChild(matrix);
}

function appendParamName(paramContainer, name){
    var nameContainer = document.createElement("div"); 
    nameContainer.classList.add("effectParameterName");
    nameContainer.innerHTML = name; 
    paramContainer.appendChild(nameContainer);
}

function renderEffectKnob(parentNode, sequencer, effect, knob_i){ 
    //create knob
    let effectKnob = pureknob.createKnob(40, 40);
    effectKnob.setProperty('trackWidth', 0.15);
    effectKnob.setProperty('angleStart', -0.75 * Math.PI)
    effectKnob.setProperty('angleEnd', 0.75 * Math.PI)
    allKnobs.push(effectKnob)
    
    //get color from css variable
    let root = document.querySelector(':root'); 
    let white = getComputedStyle(root).getPropertyValue('--white');
    let grey = getComputedStyle(root).getPropertyValue('--grey');
    effectKnob.setProperty('colorFG', white) 
    effectKnob.setProperty('colorBG', grey) 
    
    //append to parent node
    let effectKnobNode = effectKnob.node()
    parentNode.classList.add("clickable")
    parentNode.appendChild(effectKnobNode)
    
    //add a listener to handle the changes of the knob value
    effectKnob.addListener(function(knob, value){
        if(effect == 0 && knob_i == 0){ //rev.decay
            sequencer.setRevDecayValue(value/100);
        }else if(effect==0 && knob_i== 1){ //rev.mix
            sequencer.setRevMixValue(value/100);
        }else if(effect==0 && knob_i == 2){ // rev.time
            sequencer.setRevTimeValue(value/100);
        }else if(effect==1 && knob_i==0){ //del.time
            sequencer.setDelayTimeValue(value/100);
        }else if(effect==1 && knob_i==1){ //del.feedback
            sequencer.setDelayFeedbackValue(value/100);
        }else if(effect==1 && knob_i==2){ //del.mix
            sequencer.setDelayMixValue(value/100);
        }else if (effect==2 && knob_i==0){ //flanger.speed/depth
            sequencer.setFuzzLowValue(value/100);
        }else if (effect==2 && knob_i==1){ //fuzz.mix
            sequencer.setFuzzHighValue(value/100);
        }else if (effect==3 && knob_i==0){ //pan
            sequencer.setPanValue(-1 + 2*(value/100));
        }else if (effect==4 && knob_i==0){ // lpf.frequency
            sequencer.setFilterFreqValue(Math.pow(value, 2)*2)
        }else if (effect==4 && knob_i==1){ // lpf.peak
            sequencer.setFilterPeakValue(value/5);
        }
    });

    //set current value for knob
    if(effect == 0 && knob_i == 0){ //rev.decay
        effectKnob.setValue(100*sequencer.effectsArray[0].decay)
    }else if(effect==0 && knob_i== 1){ //rev.mix
        effectKnob.setValue(100*sequencer.effectsArray[0].mix)
    }else if(effect==0 && knob_i == 2){ // rev.time
        effectKnob.setValue(100*sequencer.effectsArray[0].time)
    }else if(effect==1 && knob_i==0){ //del.time
        effectKnob.setValue(100*sequencer.effectsArray[1].time)
    }else if(effect==1 && knob_i==1){ //del.feedback
        effectKnob.setValue(100*sequencer.effectsArray[1].feedback)
    }else if(effect==1 && knob_i==2){ //del.mix
        effectKnob.setValue(100*sequencer.effectsArray[1].mix)
    }else if (effect==2 && knob_i==0){ //flanger.speed/depth
        effectKnob.setValue(100*sequencer.effectsArray[2].speed)
    }else if (effect==2 && knob_i==1){ //flanger.mix
        effectKnob.setValue(100*sequencer.effectsArray[2].mix)
    }else if (effect==3 && knob_i==0){ //pan
        effectKnob.setValue(50+50*sequencer.effectsArray[3].pan)
    }else if (effect==4 && knob_i==0){ // lpf.frequency
        effectKnob.setValue(Math.sqrt(sequencer.effectsArray[4].frequency/2))
    }else if (effect==4 && knob_i==1){ // lpf.peak
        effectKnob.setValue(5*sequencer.effectsArray[4].peak)
    }
}

function renderInnerMatrix(node, sequencer){
    var stepArray = [];
    var efArray = [];
    var matrixStepColumn = document.createElement("div"); 
    matrixStepColumn.style.display = "flex";
    matrixStepColumn.style.marginLeft = 20; 
    
    for(var s = 0 ; s<sequencer.stepsNumber ; s++){
        stepArray[s] = document.createElement("div"); 

        for(var ef = 0 ; ef < sequencer.effectsArray.length ; ef++){
            efArray[ef] = document.createElement("div"); 
            efArray[ef].classList.add("clickable"); 
            efArray[ef].classList.add("matrixConnection");

            if(sequencer.connections[ef][s]==1){
                efArray[ef].classList.add("playingEffect")
            }

            boxId = "connection," + s + "," + ef; 
            efArray[ef].setAttribute("id", boxId);

            efArray[ef].onclick = function(){
                [dummy, st, effect] = this.id.split(',');
                if(sequencer.connections[effect][st] == 1 ){
                    //if 1 and it get clicked it means we have to disconnect
                    sequencer.disconnectEffect(effect, sequencer.steps[st] );
                    this.classList.toggle("playingEffect")
                }else{
                    sequencer.applyEffect(effect, sequencer.steps[st]);
                    this.classList.toggle("playingEffect")
                }
            }; 

            if(ef != 0 ){
                efArray[ef].classList.add("matrixConnectionOthers");
            }
            stepArray[s].appendChild(efArray[ef]); 
        }

        //matrix column led
        let led = document.createElement("div")
        led.classList.add("matrixBlinkLed")
        led.id = "led"+sequencer._id+","+(s+1);
        stepArray[s].appendChild(led)

        stepArray[s].classList.add("stepArray");
        if(s != 0){
            stepArray[s].classList.add("stepArrayOthers");
        }
        matrixStepColumn.appendChild(stepArray[s]);
    }

    var innerMatrix = document.createElement("div"); 
    innerMatrix.appendChild(matrixStepColumn); 
    node.appendChild(innerMatrix);
}

function addControlPannel(controlPannel){
    renderControlPannel(controlPannel);
}

function drawPlayButtonNode(ctx, w, h){
    ctx.clearRect(0, 0, w, h);
    ctx.moveTo(w/6, h/6)
    ctx.lineTo(w*5/6, h*3/6)
    ctx.lineTo(w/6, h*5/6)
    ctx.lineTo(w/6, h/6)
    ctx.fillStyle = getComputedStyle(document.querySelector(':root')).getPropertyValue('--white')
    ctx.fill();
}

function drawPauseButtonNode(ctx, w, h){
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(document.querySelector(':root')).getPropertyValue('--white')
    ctx.fillRect(w/6, h/6, w*4/6, h*4/6);
    ctx.clearRect(w*5/12, h/6, w*2/12, h*4/6);
}

function drawStopButton(ctx_stop){
    ctx_stop.fillStyle = getComputedStyle(document.querySelector(':root')).getPropertyValue('--white')
    ctx_stop.fillRect(60/6, 60/6, 60*4/6, 60*4/6);
}

function renderControlPannel(node){
    //Render the pannel
    controlPannelContainer = document.createElement("div")
    controlPannelContainer.classList.add("controlPannel")
    controlPannelContainerNode = node.appendChild(controlPannelContainer)

    //Render the main gain knob
    renderGlobalAppGainKnob(controlPannelContainerNode)
    
    //Render the play/pause button
    var playButtonCanvas = document.createElement("canvas")
    playButtonCanvas.classList.add("playPauseButton")
    playButtonCanvas.classList.add("clickable")
    playButtonCanvas.title = "play/pause"
    playButtonCanvas.setAttribute("width", "60")
    playButtonCanvas.setAttribute("height", "60")
    var w = playButtonCanvas.width
    var h = playButtonCanvas.height
    playPauseButtonContext = playButtonCanvas.getContext("2d")
    playButtonNode = controlPannelContainerNode.appendChild(playButtonCanvas)
    
    drawPlayButtonNode(playPauseButtonContext, w, h)
    
    //--set the switch between play and pause button
    playButtonNode.onclick = function(){
        if(!recentlyPressedPlayButton){ // weird bug if I don't do this
            recentlyPressedPlayButton = true;
            setTimeout(function(){ recentlyPressedPlayButton = false }, 300) //"debounce"

            if(!globalPlaying){
                drawPauseButtonNode(playPauseButtonContext, w, h)
                play()
            }
            else{
                drawPlayButtonNode(playPauseButtonContext, w, h)
                pause()
            }
        }
    }
    
    //Render the stop button 
    var stopButtonCanvas = document.createElement("canvas")
    stopButtonCanvas.setAttribute("width", "60")
    stopButtonCanvas.setAttribute("height", "60")
    stopButtonCanvas.classList.add("stopButton")
    stopButtonCanvas.title = "stop"
    stopButtonCanvas.classList.add("clickable")
    stopButtonContext =  stopButtonCanvas.getContext("2d")
    stopButtonNode = controlPannelContainerNode.appendChild(stopButtonCanvas)
    drawStopButton(stopButtonContext)
    
    stopButtonCanvas.onclick = function(){
        drawPlayButtonNode(playPauseButtonContext, w, h)
        stop();
    }
    
    //Render the bpm box
    bmpInputBoxContainer = document.createElement("div")
    bmpInputBoxContainerNode = controlPannelContainerNode.appendChild(bmpInputBoxContainer)
    bmpInputBoxContainerNode.classList.add("bpmInputBox")
    bmpInputBoxContainerNode.classList.add("clickable")
    bpmInputBox = document.createElement("input")
    bpmInputBox.title = "enter bpm by writing the number or by using the arrows"
    bpmInputBox.classList.add("bpmInputBox")
    bpmInputBox.type = "number"
    bpmInputBox.defaultValue = bpm
    bpmInputBox.min = 12
    bpmInputBox.max = 200
    let refInputBox = bpmInputBox;
    bpmInputBox.onclick = function(){
        refInputBox.select()
    }
    bpmInputBox.onchange = function(){
        setBpm(refInputBox.value);
        
        if(refInputBox.value<12 || refInputBox.value>200){ //if user manually inserted a value too big or too small
            refInputBox.value = bpm;
        }
    }
    bmpInputBoxContainerNode.appendChild(bpmInputBox)

    //metronome
    metronomeButton = document.createElement("div")
    metronomeButton.classList.add("clickable")
    metronomeButton.classList.add("letterButton")
    metronomeButton.title = "click to turn on/off metronome"
    metronomeButton.innerHTML = "metronome"
    metronomeButton.style.fontSize = "12px"
    metronomeButton.style.marginTop = "5px"
    refMetronomeButton = metronomeButton;
    metronomeButton.onclick = function(){
        refMetronomeButton.classList.toggle("activated");
        toggleMetronome();
    }
    bmpInputBoxContainerNode.appendChild(metronomeButton)

    //Render the add sequencer button
    addSequencerButton = document.createElement("div")
    addSequencerButton.classList.add("addDeleteSequencer")
    addSequencerButton.classList.add("clickable")
    addSequencerButton.title = "click to create a new sequencer"
    addSequencerButton.setAttribute("title", "add a new sequencer")
    addSequencerButton.innerHTML = '+' 
    addSequencerButton.onclick = function(){
        addSequencer(sequencersContainer, true)
    }
    controlPannelContainerNode.appendChild(addSequencerButton)
    
    //Render the delete sequencer button
    deleteSequencerButton = document.createElement("div")
    deleteSequencerButton.classList.add("addDeleteSequencer")
    deleteSequencerButton.classList.add("clickable")
    deleteSequencerButton.setAttribute("title", "remove last sequencer")
    deleteSequencerButton.innerHTML = '-' 
    deleteSequencerButton.onclick = function(){
        removeLastSequencer();
    }
    controlPannelContainerNode.appendChild(deleteSequencerButton)
    
    //Render the rec button
    recButton = document.createElement("div")
    recButton.classList.add("recButton")
    recButton.classList.add("clickable")
    recButton.title = "click to record the session, click again to download the recording"
    controlPannelContainerNode.appendChild(recButton)
    let refRecButton = recButton;
    recButton.onclick = function(){
        if(!refRecButton.classList.contains("recording")){
            startRecordingGlobalAudio();
        }else{
            stopRecordingGlobalAudio();
        }
        refRecButton.classList.toggle("recording")
    }

    //Render the random theme and the party button
    micMonitorButton = document.createElement("div")
    micMonitorButton.classList.add("letterButton")
    micMonitorButton.classList.add("clickable")
    micMonitorButton.id = "micMonitorButton"
    micMonitorButton.style.fontSize = "12px"
    micMonitorButton.style.marginLeft = "34px"
    micMonitorButton.title = "turn on/off input microphone monitoring"
    micMonitorButton.innerHTML = "mic" + "<br>" +  "monitor" 
    let refMicMonitorButton = micMonitorButton
    micMonitorButton.onclick = function(){
        toggleMicMonitor()
        refMicMonitorButton.classList.toggle("activated")
    }
    controlPannelContainerNode.appendChild(micMonitorButton)

    //next theme
    randomThemeButton = document.createElement("div")
    randomThemeButton.classList.add("randomThemeButton")
    randomThemeButton.classList.add("clickable")
    randomThemeButton.title = "change theme"
    randomThemeButton.innerHTML = "NEXT" + "<br>" +  "THEME" 
    randomThemeButton.onclick = function(){
        loadNextTheme()
    }
    controlPannelContainerNode.appendChild(randomThemeButton)

    //party
    partyButton = document.createElement("div")
    partyButton.classList.add("partyButton")
    partyButton.classList.add("clickable")
    partyButton.title = "click to have a party! WARNING: quantum computer needed for this feature to perform well when more than a couple of sequencers are present"
    partyButton.innerHTML = "PARTY!"
    let refPartyButton = partyButton;
    partyButton.onclick = function(){
        toggleRandomThemeOnMetronome()
        refPartyButton.classList.toggle("activated")
    }
    controlPannelContainerNode.appendChild(partyButton)
}