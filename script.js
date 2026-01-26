// ==========================================
// LEHRA COMPOSER - FINAL RELEASE
// ==========================================

// --- 1. DOM ELEMENTS ---
const playBtn = document.getElementById('playBtn');
const tempoSlider = document.getElementById('tempoSlider');
const bpmDisplay = document.getElementById('bpmDisplay');
const pitchSlider = document.getElementById('pitchSlider');
const pitchDisplay = document.getElementById('pitchDisplay');
const beatCircle = document.getElementById('beatCircle');
const currentMatraDisplay = document.getElementById('currentMatra');
const absKeyDisplay = document.getElementById('absKeyDisplay');

// Selectors
const taalSelect = document.getElementById('taalSelect');
const raagSelect = document.getElementById('raagSelect');
const instrumentSelect = document.getElementById('instrumentSelect');
const layaDisplay = document.getElementById('layaDisplay');
const tempoValueLabel = document.getElementById('tempoValueLabel');

// Practice Mode
const practiceToggle = document.getElementById('practiceModeToggle');
const practiceSettings = document.getElementById('practiceSettings');
const bpmIncreaseStep = document.getElementById('bpmIncreaseStep');
const intervalMinutes = document.getElementById('intervalMinutes');
const nextJumpDisplay = document.getElementById('nextJumpDisplay');

// Tanpura
const tanpuraToggle = document.getElementById('tanpuraToggle');
const tanpuraVolumeSlider = document.getElementById('tanpuraVolume');

// --- 2. DATA CONFIGURATION ---
const taals = {
    teental: { beats: 16, sam: [0], khali: [8] },
    rupak:   { beats: 7,  sam: [0], khali: [0, 3] },
    jhaptal: { beats: 10, sam: [0], khali: [5] },
    dadra:   { beats: 6,  sam: [0], khali: [3] },
    keherwa: { beats: 8,  sam: [0], khali: [4] }
};

// --- 3. STATE VARIABLES ---
let isPlaying = false;
let currentBpm = 100;
let currentLayaState = "madhya";
let activeFileBaseBpm = 100; 
let audioLoopEventId = null; // Store ID to cancel loop later

let isPracticeMode = false;
let lastJumpTime = 0; 
let pendingBpmIncrease = false; 
let isTanpuraOn = false;

// --- 4. AUDIO ENGINE ---

// Lehra Player
const player = new Tone.GrainPlayer({
    url: "assets/audio/teental_kirwani_madhya_santoor.mp3", // Make sure this default exists!
    loop: false, // We handle looping manually
    grainSize: 0.1, overlap: 0.05,
    onload: () => console.log("Lehra Initialized")
}).toDestination();

// Tanpura Player
const tanpuraPlayer = new Tone.Player({
    url: "assets/audio/tanpura_drone.mp3", 
    loop: true, fadeIn: 2, fadeOut: 2
}).toDestination();
tanpuraPlayer.volume.value = -10;

// --- 5. LOGIC: SMART LOADER ---

function getLayaCategory(bpm) {
    if (bpm < 70) return "vilambit";
    if (bpm > 130) return "drut";
    return "madhya";
}

function getBaseBpmForLaya(laya) {
    if (laya === "vilambit") return 40; 
    if (laya === "madhya") return 100;
    if (laya === "drut") return 150;
    return 100;
}

function loadCorrectLehra() {
    const selectedTaal = taalSelect.value;
    const selectedRaag = raagSelect.value;
    const selectedInstrument = instrumentSelect.value;
    const laya = getLayaCategory(currentBpm);
    
    // Construct the filename we EXPECT to find
    const fileName = `${selectedTaal}_${selectedRaag}_${laya}_${selectedInstrument}.mp3`;
    const fullPath = `assets/audio/${fileName}`;
    
    console.log("Attempting to load:", fullPath);
    layaDisplay.innerText = `Loading: ${fileName}...`;
    layaDisplay.style.color = "#ffff00"; // Yellow for "Loading"

    // Create the buffer with an Error Handler
    const newBuffer = new Tone.ToneAudioBuffer(
        fullPath, 
        // 1. ON SUCCESS
        () => {
            currentLayaState = laya;
            activeFileBaseBpm = getBaseBpmForLaya(laya);
            
            player.buffer = newBuffer; // Swap the audio
            console.log("Success! Playing:", fileName);
            
            layaDisplay.innerText = `Playing: ${fileName} (Base: ${activeFileBaseBpm})`;
            layaDisplay.style.color = "#00ffcc"; // Cyan for "Success"
        },
        // 2. ON ERROR (File Missing)
        (e) => {
            console.error("File not found:", fullPath);
            layaDisplay.innerText = `❌ Error: Missing file ${fileName}`;
            layaDisplay.style.color = "#ff4d4d"; // Red for "Error"
        }
    );
}

function updateTaalVisuals() {
    const taalData = taals[taalSelect.value];
    beatCircle.innerHTML = ''; 
    const radius = 100;
    
    for (let i = 0; i < taalData.beats; i++) {
        const dot = document.createElement('div');
        dot.classList.add('beat-dot');
        if (taalData.sam.includes(i)) dot.classList.add('sam');
        if (taalData.khali.includes(i)) dot.classList.add('khali');
        
        const angle = (2 * Math.PI * i / taalData.beats) - (Math.PI / 2);
        dot.style.transform = `translate(${Math.cos(angle)*radius}px, ${Math.sin(angle)*radius}px)`;
        dot.id = `beat-${i}`;
        beatCircle.appendChild(dot);
    }
}
updateTaalVisuals();

// --- 6. CLOCK & SYNC ---

// A. Visual Clock (Every Quarter Note)
Tone.Transport.scheduleRepeat((time) => {
    const taalData = taals[taalSelect.value];
    const pos = Tone.Transport.position.split(':');
    const bars = parseInt(pos[0]);
    const quarters = parseInt(pos[1]);
    const totalBeats = (bars * 4) + quarters;
    const currentBeatIndex = totalBeats % taalData.beats;

    Tone.Draw.schedule(() => {
        updateVisuals(currentBeatIndex);
        if (isPracticeMode && isPlaying && !pendingBpmIncrease) checkAutoIncrease();
        if (currentBeatIndex === 0 && pendingBpmIncrease) applyTempoChange();
    }, time);
}, "4n");

// --- 7. HELPER FUNCTIONS ---

function startAudioLoop() {
    // 1. Clear any existing loop to prevent double-playing
    if (audioLoopEventId !== null) {
        Tone.Transport.clear(audioLoopEventId);
    }

    // 2. Calculate the loop duration based on the selected Taal
    // "1m" = 4 beats. 
    // Format "0:0:0" -> "Measures:Beats:Sixteenths"
    const beatCount = taals[taalSelect.value].beats;
    
    // We convert beats to measures. 
    // e.g. Teental (16) = 4 measures. Rupak (7) = 1 measure + 3 beats.
    // Tone.js notation: "1m" = 4 beats.
    // Easiest way: Use "4n" (quarter note) * count
    const interval = beatCount + "n"; // e.g. "16n" is wrong. "4n * 16" is better?
    
    // Better: Calculation in seconds is risky. Calculation in notation is best.
    // Let's use the measure:beat format string.
    const measures = Math.floor(beatCount / 4);
    const remainingBeats = beatCount % 4;
    const intervalString = `${measures}:${remainingBeats}:0`;

    console.log("Loop Interval set to:", intervalString);

    // 3. Schedule the loop
    audioLoopEventId = Tone.Transport.scheduleRepeat((time) => {
        player.start(time);
    }, intervalString, "0:0:0");
}

function updateVisuals(index) {
    document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active', 'active-sam'));
    const currentDot = document.getElementById(`beat-${index}`);
    if (currentDot) {
        index === 0 ? currentDot.classList.add('active-sam') : currentDot.classList.add('active');
        currentMatraDisplay.innerText = index + 1;
    }
}

function manageTanpuraState() {
    if (isTanpuraOn && isPlaying) {
        if (tanpuraPlayer.state !== "started") tanpuraPlayer.start();
    } else {
        if (tanpuraPlayer.state === "started") tanpuraPlayer.stop();
    }
}

function checkAutoIncrease() {
    const currentTime = Tone.Transport.seconds;
    const intervalSeconds = parseInt(intervalMinutes.value) * 60;
    const timeSinceLastJump = currentTime - lastJumpTime;
    const timeLeft = intervalSeconds - timeSinceLastJump;
    
    if (timeLeft > 0) {
        const mins = Math.floor(timeLeft / 60);
        const secs = Math.floor(timeLeft % 60);
        nextJumpDisplay.innerText = `Next Jump: ${mins}:${secs < 10 ? '0'+secs : secs}`;
        nextJumpDisplay.style.color = "#d4af37"; 
    } else {
        pendingBpmIncrease = true;
        nextJumpDisplay.innerText = "Jump at next Sam...";
        nextJumpDisplay.style.color = "#00ffcc"; 
    }
}

function applyTempoChange() {
    const step = parseInt(bpmIncreaseStep.value);
    currentBpm += step;
    if (currentBpm > 300) currentBpm = 300;
    updateTempo(currentBpm);
    document.body.style.backgroundColor = "#1a332a";
    setTimeout(() => { document.body.style.backgroundColor = "#121212"; }, 500);
    pendingBpmIncrease = false;
    lastJumpTime = Tone.Transport.seconds; 
}

function updateTempo(newBpm) {
    currentBpm = newBpm;
    bpmDisplay.innerText = currentBpm;
    tempoSlider.value = currentBpm;
    
    // --- NEW LINE: Update the slider label text ---
    if(tempoValueLabel) tempoValueLabel.innerText = `${currentBpm} BPM`;

    // ... existing code ...
    const newLaya = getLayaCategory(currentBpm);
    if (newLaya !== currentLayaState) {
        loadCorrectLehra();
    }
    player.playbackRate = currentBpm / activeFileBaseBpm;
    Tone.Transport.bpm.value = currentBpm;
}

// Western Scale (12 Semitones)
const noteNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function updateKeyDisplay(semitones) {
        // ... (existing index calculation logic stays the same) ...
        const baseIndex = 0; 
        let newIndex = (baseIndex + semitones) % 12;
        if (newIndex < 0) newIndex += 12;
        
        // UPDATE: Just the Note Name (e.g., "C", "Db")
        // No "Key:" prefix, because that is in the HTML now
        absKeyDisplay.innerText = noteNames[newIndex];
    }

// --- 8. CONTROLS ---

// Dropdowns
taalSelect.addEventListener('change', () => { 
    updateTaalVisuals(); 
    loadCorrectLehra(); 
    // Restart loop if playing to apply new length immediately
    if (isPlaying) {
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        startAudioLoop();
        Tone.Transport.start();
    }
});

raagSelect.addEventListener('change', () => { loadCorrectLehra(); });
instrumentSelect.addEventListener('change', () => { loadCorrectLehra(); });

// Sliders
tempoSlider.addEventListener('input', (e) => updateTempo(parseInt(e.target.value)));
pitchSlider.addEventListener('input', (e) => {
    const s = parseInt(e.target.value);

    // Update Relative Display (+1, -1)
    pitchDisplay.innerText = s > 0 ? `+${s}` : s;

    // Update Absolute Display (Key: C#)
    updateKeyDisplay(s);

    // Audio Logic
    player.detune = s * 100;
    if (tanpuraPlayer) tanpuraPlayer.playbackRate = Math.pow(2, s / 12);
});

tanpuraVolumeSlider.addEventListener('input', (e) => { tanpuraPlayer.volume.value = parseInt(e.target.value); });
tanpuraToggle.addEventListener('change', (e) => { isTanpuraOn = e.target.checked; manageTanpuraState(); });
practiceToggle.addEventListener('change', (e) => {
    isPracticeMode = e.target.checked;
    if (isPracticeMode) {
        // Show the settings
        practiceSettings.style.display = "flex"; 
        // Reset timer
        lastJumpTime = Tone.Transport.seconds; 
    } else {
        // Hide the settings
        practiceSettings.style.display = "none";
        nextJumpDisplay.innerText = ""; // Clear text
        pendingBpmIncrease = false;
    }
});

playBtn.addEventListener('click', async () => {
    await Tone.start();
    
    if (!isPlaying) {
        loadCorrectLehra();
        Tone.Transport.bpm.value = currentBpm;
        
        // START THE DYNAMIC LOOP
        startAudioLoop();
        
        Tone.Transport.start();
        lastJumpTime = Tone.Transport.seconds;
        isPlaying = true;
        manageTanpuraState();
        
        playBtn.innerText = "STOP";
        playBtn.style.background = "#ff4d4d";
        playBtn.style.color = "white";
    } else {
        Tone.Transport.stop();
        if (audioLoopEventId !== null) Tone.Transport.clear(audioLoopEventId); // Stop the scheduler
        player.stop();
        isPlaying = false;
        manageTanpuraState();
        
        Tone.Transport.position = 0;
        document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active', 'active-sam'));
        currentMatraDisplay.innerText = "1";
        playBtn.innerText = "START";
        playBtn.style.background = "linear-gradient(145deg, #d4af37, #aa8c2c)";
        playBtn.style.color = "#121212";
    }
});

// Prevent negative/zero inputs for Riyaz
const enforceMin = (e) => {
    if (e.target.value < 1) e.target.value = 1;
};
bpmIncreaseStep.addEventListener('change', enforceMin);
intervalMinutes.addEventListener('change', enforceMin);