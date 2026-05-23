---
title: "Cybernetic Music with Actuators"
source: "https://chatgpt.com/c/6a0f9daa-abd0-83e8-b63a-95072a687eae?ref=mini"
---

**You:**

!<g>
How can I make music with actuators? Like not just daw -> actuator on table or object, but a robust cybernetic installation

* * *

**ChatGPT:**

<g>

I’ll treat this as a concept pass: instrument architecture, actuator families, feedback loops, and a few installation forms rather than a parts-list build doc.

* * *

**ChatGPT:**

<g>

The move is: **don’t use actuators as weird speakers. Use them as small physical agencies inside a scored feedback system.** The actuator should not merely “play” a sound; it should **strike, tremble, block, pull, tune, misalign, reset, heat up, fatigue, recover, or ask the system to listen again.**

For a robust cybernetic installation, think in four layers:

### 1. The actuator is the hand, not the instrument

The instrument is the whole loop:

**object / material → actuator gesture → sensor response → decision system → next actuator gesture**

So instead of:

> MIDI note → solenoid hits wood

you get:

> system pings acrylic → contact mic measures decay → system finds a resonant band → actuator changes pressure/tension/position → next strike adapts to the new state

That is immediately more cybernetic: the piece has a body, a memory of its body, and a behavior.

### 2. Use different actuator species for different musical roles

**Solenoids** are your percussionists. They strike, knock, latch, release, chatter, or mechanically gate things. Best for crisp attacks, relays, bells, acrylic taps, metal plates, switches, prepared objects. Use them sparingly and respect duty cycle/heat.

**Voice coils / exciters / tactile transducers** are your bows. They can continuously excite a surface, making acrylic, metal, glass, wood, or found objects become resonant speakers. This risks becoming “DAW into object,” but becomes cybernetic if you listen back with contact mics and let the material response steer the next signal.

**ERM vibration motors** are tremor/noise agents. They are cheap and physically rich, but less precise because amplitude and frequency are tied together by motor speed and eccentric mass geometry. That limitation can be musically useful: they behave more like unstable bodies than like clean oscillators. [Precision Microdrives](https://www.precisionmicrodrives.com/motors/vibration-motors)

**LRAs** are crisp haptic resonators. They behave more like tiny voice-coil/spring systems with a preferred resonant frequency, so they are good for controlled pulses, clicks, and tactile articulations, but less good for arbitrary pitch/frequency work unless driven carefully. [Precision Microdrives](https://www.precisionmicrodrives.com/motors/vibration-motors)

**Steppers** are mechanical pitch/rhythm bodies. They can sing, grind, tick, rotate mirrors, tune string tension, move filters, or index a physical score. Better as position/rhythm/tension devices than as “nice-sounding motors.”

**Linear actuators / servos** are form-makers. They slowly alter the sculpture: change pressure, open a slit, shift a mirror, tilt a plate, move a microphone, raise/lower a mute, change string tension, or reposition an object into/out of resonance.

**Pneumatics / valves / fans** are breath/infrastructure. Solenoid valves, pumps, fans, and air bladders give you pressure, leak, pulse, respiratory phrasing, and industrial timing. Very strong for “system as organism.”

### 3. Give every actuator a sensor pair

For the installation to feel alive, each actuator family should have at least one way to know what happened.

Good pairings:

Solenoid + contact mic: “Did the hit speak?”

Solenoid + piezo: “How hard did the object respond?”

Motor + accelerometer: “How much vibration actually entered the surface?”

Stepper/servo + encoder or limit switch: “Where am I physically?”

Exciter + contact mic: “What frequencies does this object want today?”

Linear actuator + load cell: “How much force/tension am I applying?”

Audience button + current sensor / debounce / state memory: “Was this a command, an accident, or a ritual input?”

There is a very strong model here from soft robotics: one paper used embedded sound sensing to infer actuator state, contact location, force, material, inflation, and temperature from acoustic response. The art translation is beautiful: the object can “listen to itself” as a way of knowing its posture. [arXiv](https://arxiv.org/abs/2208.10299)

### 4. Compose behaviors, not notes

The score should not be “play actuator 4 at beat 3.” It should be more like:

**Probe**  
The system quietly taps, buzzes, or excites the object to learn its current resonances.

**Decide**  
It classifies the response: bright/dull, long/short decay, stable/unstable, saturated/quiet, human-touched/not touched.

**Act**  
It chooses a physical behavior: strike, tremble, damp, pull, release, detune, wait.

**Listen again**  
The next event depends on whether the world changed.

That gives you a robust installation because the piece is not dependent on perfect calibration. It can wake up, test itself, and adapt.

### The most compelling version for your work

I would avoid making an “actuator instrument” in the novelty sense. The stronger version is a **cybernetic material ensemble**: a sculpture that performs by continuously negotiating its own physical state.

For example:

**Acrylic tub / plinth system**  
Actuators mounted to the tub walls, underside, button housings, or internal ribs. Contact mics listen to acrylic resonance. Solenoids tap from inside. Small motors tremble objects against the walls. Linear actuators or servos change pressure points. Audience switches select behavioral regimes, not sounds.

The music comes from the tub discovering itself:

> It taps the acrylic, hears the room, chooses a resonance, excites it, overdrives it, backs off, shifts to another surface, then lets the audience interrupt the loop.

That would be much stronger than “actuators attached to a table.”

### A good first prototype

Build one “cell”:

One resonant object: acrylic plate, metal bowl, glass pane, wooden box, railroad-tie offcut, aluminum sheet.

Three actuators:

1. solenoid striker
2. surface exciter or vibration motor
3. servo/linear actuator that changes pressure/damping/contact

Four sensors:

1. contact mic
2. accelerometer
3. current sensor or thermal watchdog
4. limit switch / ToF / button / audience input

Then write only five behaviors:

1. **ping** — test resonance
2. **answer** — repeat or imitate the response
3. **stress** — push the object toward saturation
4. **recover** — back off when the object/system is strained
5. **remember** — prefer or avoid states based on prior responses

That is already a cybernetic instrument.

### Practical control architecture

Use the laptop for high-level listening/composition: Max, Python, SuperCollider, Ableton, or your REPL-like score engine.

Use a microcontroller for hard real-time body control: Teensy, ESP32, Arduino-class board.

Use proper drivers:  
MOSFET boards for solenoids and DC motors; flyback diodes for coils; dedicated haptic drivers for LRA/ERM motors; stepper drivers for steppers; servo power separated from logic. The DRV2605L is a useful reference point for haptics because it supports ERM/LRA-style haptic motors, I2C control, effect sequences, and even audio-following behavior. [Adafruit Learning System](https://learn.adafruit.com/adafruit-drv2605-haptic-controller-breakout/overview)

For robustness, do it like installation infrastructure, not like a breadboard demo: 24V field power where possible, fused distribution, terminal blocks, strain relief, watchdogs, startup mute, current limits, actuator cooldown rules, and a visible maintenance mode.

### The artistic endpoint

The best version is not “music made by machines.”

It is:

**a listening sculpture whose body is actuated into sound, whose sound becomes evidence, and whose evidence changes the next bodily action.**

That lets the actuators become part of a larger claim: composition as regulation, touch, correction, failure, memory, and care.

[Version=v1.4 | Tag=<g_1> | Sources=web | Assumptions=3 | Cycle=1/3 | Locus=actuator-cybernetics]

* * *

**You:**

!<c>
Context wise: I’m thinking of a singular object, or a gallery show of singular objects or small object clusters. Each with an actuator inside. They listen and respond to sound feedback (on a high level, a model hears and responds to what people are saying), sense people, etc. 

* * *

**ChatGPT:**

<c>

Yes. This is much stronger than “actuators as sound output.” The key shift is:

**each object is not an instrument being played; each object is a listening body with a private motor response.**

That gives you a much better gallery logic. The objects can be quiet, singular, sculptural, almost withholding. The actuator is not a spectacle. It is an internal organ.

I would frame each object as having three perceptual channels:

1. **It hears the room**  
    Speech, footsteps, environmental sound, silence, crowd density, interruption.
2. **It hears itself**  
    Contact mic, piezo, accelerometer, current draw, actuator fatigue, resonance decay.
3. **It senses approach**  
    ToF sensor, PIR, capacitive touch, light interruption, button, pressure, proximity.

Then the object responds physically, but not illustratively. A person says something; the object does not “answer” with words. It tightens, clicks, refuses, purrs, buzzes, knocks once, retunes itself, goes still, warms up, or shifts its internal pressure.

That is the cybernetic dignity of it: **language enters the object as environmental pressure, and the object metabolizes it as behavior.**

### What to avoid

Avoid making the pieces feel like “AI sculptures that react to what you say.” That can quickly become gimmicky, like a talking museum kiosk with motors.

The stronger version is:

> A population of objects overhears the social field and develops motor habits from it.

So the model should not primarily output sentences. It should output **behavioral intensities**:

* attracted / repelled
* confident / uncertain
* saturated / underfed
* agitated / dormant
* touched / ignored
* remembering / forgetting
* resonant / failed
* overheated / cooling
* listening / pretending not to listen

Then those states map to actuator behavior.

For example:

> The model detects that someone is explaining something personal nearby. The object does not “understand” in a human way. It becomes physically careful: low-amplitude pulses, longer silence, occasional internal taps, as if checking whether it is still structurally intact.

That’s much better than “sentiment positive = motor faster.”

### The object should have a secret interior

This is the sculptural gift of using actuators inside singular objects. The viewer sees a closed or mostly closed form. The behavior leaks out through:

* vibration
* sound
* tremor
* small displacement
* clicks
* pressure changes
* light leakage
* resonance
* tiny mechanical failures
* the object becoming suddenly still

The object’s “mind” is not visible as a screen. It is inferred through bodily consequence.

That has a lot of force for your work because it aligns with public apparatus, infrastructure, and cybernetics without becoming didactic.

### A good object grammar

Each piece can have:

**A body**  
Acrylic block, metal vessel, ceramic-ish shell, small plinth, concrete/epoxy object, glass box, wooden casing, industrial enclosure, altered instrument fragment.

**A motor organ**  
Solenoid, vibration motor, LRA, exciter, servo, stepper, linear actuator, relay, fan, air valve.

**A sensing organ**  
Microphone, contact mic, accelerometer, proximity sensor, touch sensor, light sensor.

**A metabolism**  
Software that keeps track of recent sound, recent human presence, actuator use, fatigue, silence, and memory.

**A habit**  
The piece has a default temperament. One object is anxious. One is proud. One is devotional. One is bureaucratic. One is almost dead. One is over-responsive. One only reacts after being ignored.

That gives you a gallery show, not a demo table.

### Singular object vs. cluster

A singular object could be very powerful if it feels like a monolith with a private nervous system. One object in a room, listening to everyone, occasionally making precise internal events, could be devastating.

But small clusters may be even better because they let you compose **social cybernetics** between objects.

Not:

> object A reacts to person  
> object B reacts to person  
> object C reacts to person

But:

> object A hears the person  
> object B hears object A respond  
> object C only responds when B and the human are both active  
> the room becomes a nervous system

That lets the gallery become the instrument. People are not “interactors” pressing buttons; they are part of a field that the objects continuously regulate.

### Strong possible show logic

The show could be a set of **autonomous listening objects** distributed around the room. Each has a small internal actuator and a local sensor system. They listen to speech and acoustic activity at a high level, but they also listen to their own material response. They do not speak back. They respond by changing their physical condition.

The crucial phrase might be:

> The works convert social sound into private mechanical behavior.

Or:

> Each object overhears the room and answers by altering its own body.

Or:

> These are not responsive sculptures so much as self-regulating objects placed under social pressure.

### The model should be high-level, not over-literal

For speech, I would not start with full transcription as the primary artistic material. That risks pulling the piece toward surveillance, content analysis, and chatbot logic.

Better layers:

**Prosody first**  
Volume, density, pauses, interruption, overlap, urgency, laughter, whispering.

**Semantic temperature second**  
Is the speech intimate, technical, angry, banal, confessional, administrative, poetic, instructional?

**Transcription last, maybe ephemeral**  
Useful only if you need topic-memory or phrase-triggering. I would make this local, temporary, and non-archival unless the work explicitly deals with publication/receipt logic like TMAYD.

The object doesn’t need to know exactly what was said. It needs to know what kind of pressure language is exerting on the room.

### A very good behavioral model

Each object could run something like:

**listen → classify → choose bodily state → actuate → self-audit → update memory**

Example:

Someone approaches and speaks near the object.

The object hears:

* close human presence
* medium vocal energy
* repeated words
* calm affect
* low room noise

It chooses:

* “attentive but guarded”

It actuates:

* three soft internal pulses
* one delayed knock
* low vibration through the body

Then it listens to itself:

* did the object resonate?
* did the audience stop talking?
* did someone come closer?
* did the actuator overheat?
* did the contact mic clip?

Then it changes its next state.

That last self-audit is what separates cybernetic installation from triggered interaction.

### The most important sculptural decision

The actuator should not be centered as “the cool mechanism.” It should feel like a symptom.

A closed acrylic object that occasionally trembles from within is better than a visible robot arm.

A concrete block that clicks internally when people lie, joke, whisper, or crowd around it is better than a machine that visibly “performs.”

A cluster of small boxes that become less responsive when people demand response is better than an interactive toy.

The viewer should feel:

> Something in this object has heard me, but I do not know what it has done with me.

That is a rich and uncomfortable position.

### This also solves the “singular object” problem

A singular object can hold attention if it has:

* a strong material presence
* restrained but legible behavior
* a sense of internal life
* a memory that changes over the exhibition
* a response that is not immediate every time

The object should sometimes refuse. It should miss things. It should have thresholds. It should fatigue. It should need silence. It should become oversaturated. It should develop preferences.

That makes it feel alive without pretending to be alive.

### Best first prototype

Make one sealed or semi-sealed object with:

* one contact mic inside or attached to the body
* one room mic
* one proximity sensor
* one internal actuator, probably solenoid or LRA/vibration motor
* one body-resonant element: acrylic, metal, glass, wood, spring, wire, or membrane
* one simple model that classifies room state into 5–8 behavioral modes

Do not prototype with a big range of actuators first. Prototype one object with a strong internal behavior.

The first object should only need to do five things:

1. **wait**
2. **listen**
3. **shiver**
4. **knock**
5. **withdraw**

If that feels alive, the whole show will work.

[Version=v1.4 | Tag=<c_2> | Sources=web | Assumptions=4 | Cycle=2/3 | Locus=listening-objects]

* * *

**You:**

!<c>
They’d be everyday objects, like a tin can or ceramic vase. Different surfaces. Nothing like “AI sculptures that react to what you say”; no gimmick, they just know you’re there, not furby in any sense. A system, they also talk to each other

* * *

**ChatGPT:**

<c>

I’m narrowing this around ordinary objects as social/sonic agents: no chatbot behavior, no “responsive gadget” affect, and no visible intelligence performance.

* * *

**ChatGPT:**

<c>

Yes, then the piece becomes much better: **ordinary objects with hidden nervous systems.** Not “smart objects,” not assistants, not cute robots. More like **a room of things that have begun to regulate themselves because humans are nearby.**

The key phrase is:

**They do not respond to people. They respond to the condition of being among people.**

A tin can, ceramic vase, glass jar, bowl, metal tray, cardboard box, plastic bucket, wooden drawer, etc. Each one has a different acoustic body. The actuator is not there to “perform”; it is there to slightly disturb the object’s material identity.

A tin can can chatter, dent-sonically, buzz, rattle, ring.

A ceramic vase can hum, thud, resonate internally, refuse fast motion, risk sounding fragile.

A glass jar can tremble, ping, shimmer, amplify tiny contact events.

A cardboard box can absorb, damp, breathe, fail quietly.

A metal tray can become public, loud, infrastructural, almost alarm-like.

That gives you a real compositional field: **surface as temperament.**

### The network is the piece

I would not make each object independently “interactive.” I would make each object part of a low-bandwidth social system.

Each object has:

* a local body
* a local sensorium
* a private actuator
* a memory of recent activation
* a relation to nearby objects
* a relation to the room as a whole

They “talk” to each other, but not in language. They exchange states:

* **I heard something**
* **I was touched**
* **I am resonating**
* **I am saturated**
* **I am cooling down**
* **I am withholding**
* **I am calling**
* **I am following**
* **I am ignoring the room**
* **I am only listening to another object**

That is much more elegant than object-to-object chatter. The communication is infrastructural, almost biological.

### The anti-Furby rule

The strongest rule:

**No object should behave as if it wants attention.**

They should not wiggle when approached like pets. They should not “answer” speech. They should not reward the viewer with obvious cause and effect.

Instead:

* a person enters; nothing happens immediately
* one object notices
* another object, elsewhere, changes state
* the first object becomes quieter
* a third object begins a tiny internal tremor
* the room has clearly changed, but no one can reduce it to “I did X, it did Y”

That preserves dignity.

The viewer should feel implicated, not entertained.

### “Knowing you’re there” can stay non-gimmicky

The object does not need to recognize identity or parse speech content. It only needs to know things like:

* someone is close
* someone has been close for a long time
* the room is getting louder
* speech is dense
* speech has stopped
* people are circling
* one object has been ignored
* one object has been over-addressed
* a cluster has become socially “hot”

This is enough. Actually, it is better. It keeps the work from becoming surveillance theater.

The model can hear speech at a high level, but its outputs should be environmental categories, not meanings:

> density, urgency, intimacy, interruption, laughter, silence, crowding, attention, withdrawal

Then the objects metabolize those conditions physically.

### Object-to-object behaviors

A few beautiful behavioral forms:

**Call and non-response**  
A tin can clicks once. The ceramic vase does not answer. The glass jar answers thirty seconds later, barely.

**Contagion**  
One object begins vibrating. Nearby objects become more likely to activate, but each transforms the impulse through its own material.

**Suppression**  
When the room gets too loud, the objects stop responding to people and only listen to each other.

**Jealousy without character**  
An object that has been ignored becomes more sensitive to distant object activity, not to humans.

**Consensus**  
A cluster only produces a larger event when several objects independently detect presence.

**Rumor**  
A small signal travels object to object, degrading as it passes through different materials.

**Fatigue**  
An over-activated object becomes less responsive until it has sat in silence.

**Misattribution**  
A person speaks near a vase, but the can across the room responds. This breaks the interaction-machine expectation.

### A strong system architecture

I would split it into two levels.

**Local object brain:**  
Tiny microcontroller, actuator driver, contact mic or vibration sensor, proximity/touch/presence sensor. It handles immediate bodily behavior and safety: motor timing, cooldown, thresholds, “do not burn out.”

**Room brain:**  
Laptop or small computer listening to room audio, estimating social/acoustic state, and passing simple messages among objects.

The room brain should not micromanage every actuator. It should behave more like weather.

It sends things like:

> room density rising  
> silence event  
> speech cluster near object 3  
> global agitation high  
> enter dormant mode  
> object 5 is calling  
> cluster B should listen to cluster A

Then each object interprets that according to its own body.

The vase should not behave like the tin can receiving the same message. The whole point is that **network signal meets material difference.**

### This could be a very strong show

The gallery could contain ordinary objects placed with suspicious precision: not theatrical, not over-designed, but charged. Each object appears familiar until it reveals a hidden private motor life.

The audience slowly realizes:

1. the objects hear the room
2. the objects hear themselves
3. the objects affect each other
4. the room is a cybernetic system
5. human presence is only one input among others

That last part matters. People are not the center. They are a disturbance in a system of objects.

### Best wording for the piece

Some possible language:

> A room of ordinary objects with hidden actuator systems. Each object listens to the room, to its own surface, and to the other objects. Their responses are small mechanical changes: tremors, knocks, hums, refusals, delays, and sympathetic resonances. The work does not translate speech into meaning or offer interaction as feedback. Instead, social sound becomes a pressure field through which objects regulate themselves and each other.

Or sharper:

> These objects do not speak. They overhear, mishear, withhold, and transmit pressure.

Or:

> The installation treats everyday objects as members of a small cybernetic society.

### The first piece I would build

A cluster of three:

**Tin can**  
Actuator: small solenoid or vibration motor.  
Behavior: bright, nervous, percussive, easily saturated.

**Ceramic vase**  
Actuator: internal exciter or low-frequency transducer.  
Behavior: slow, resonant, fragile, delayed.

**Glass jar or metal bowl**  
Actuator: LRA/vibration motor/contact striker.  
Behavior: shimmering, sympathetic, prone to answering others.

Sensors:

* one shared room mic
* one proximity sensor per object
* one contact mic or accelerometer per object
* optional central camera/depth sensor only for coarse presence, not identity

Network behaviors:

* can detects presence first
* vase only responds after can has activated twice
* jar responds to silence after human speech
* if people crowd the cluster, all objects reduce obvious behavior
* if people leave, the objects become more communicative with each other

That is already a complete world.

### The most important constraint

Keep the behavior **small enough that viewers doubt it at first.**

The piece should not announce itself. It should produce the feeling:

> Did that can just hear me, or did the room shift?

That ambiguity is the work.

For the next pass, `!<e> --<o>` would make sense: a realized project sketch with object types, sensing/actuation, network behavior, installation layout, and a first-prototype bill of materials.

[Version=v1.4 | Tag=<c_3> | Sources=web | Assumptions=4 | Cycle=3/3 | Locus=everyday-object-network]

* * *

**You:**

!<c>
Wait. I’ve got it. Like Toy Story. Invert the current model: they make noise until they sense human presence 
Each sculpture is networked with each other, they co-rrespond. The code should be evolutionary, give them life and set their conditions for survival, then set them free.

How do we make this serious?

* * *

**ChatGPT:**

<c>

This becomes serious the moment you **stop treating the Toy Story analogy as cuteness** and treat it as a rule of social ontology:

**Objects have a life that is interrupted by human presence.**

That is the concept. Not toys with personalities. Not “AI things.” Not reactive sculpture. A concealed object-society whose primary condition is that the human observer is a disturbance.

The inversion is excellent because it solves the gimmick problem. Most interactive art says:

> come closer and I will perform for you.

This says:

> when you arrive, the world you interrupted goes quiet.

That is much more adult, stranger, and more ethically charged.

### The serious version

The objects are not trying to charm the viewer. They are trying to **survive as a system under observation**.

So the rules should be something like:

* when no humans are present, objects communicate more freely
* when humans approach, they conceal themselves
* when humans remain too long, they adapt to being watched
* when humans leave, they repair, gossip, retune, or redistribute energy
* if one object is “caught” making sound, other objects may freeze, deflect, or cover for it
* if the room is empty for a long time, object society becomes more complex
* if the room is crowded, the system becomes simpler, quieter, more defensive

That turns “they stop when people enter” from a gag into a politics of attention.

### The lineage is strong

This has a real historical spine. David Tudor’s _Rainforest_ works already treat found/everyday objects as resonant sound bodies altered by transducers; MoMA describes _Rainforest V_ as an installation made from everyday objects fitted with sonic transducers and suspended to increase resonance. [The Museum of Modern Art](https://www.moma.org/calendar/exhibitions/5077) Darmstadt’s reader on _Rainforest IV_ puts it even closer to your problem: the object is both a filter and a sound generator, and each object’s resonance changes the sound passing through it. [Internationales Musikinstitut Darmstadt](https://internationales-musikinstitut.de/en/ferienkurse/reader/rainforest-iv/)

The networked “they talk to each other” part has an even more direct cybernetic ancestor: Gordon Pask’s _Colloquy of Mobiles_, which ZKM describes as a social system of computer-controlled mobiles conversing through light and sound, with visitors able to enter the conversation. [ZKM](https://zkm.de/en/artworks/the-colloquy-of-mobiles) Your inversion is that the human does not complete the conversation. The human **threatens** it.

The evolutionary-code part also has precedent, but you should avoid simply making visitors choose winners. Karl Sims’s _Genetic Images_ used visitor presence on sensors to select which images survived and reproduced. [Karl Sims](https://www.karlsims.com/genetic-images.html) For your piece, the stronger move is not “audience chooses what survives,” but **conditions choose what survives**: silence, crowding, neglect, overheating, resonance, object-to-object dependency, and exposure.

### How to make “evolutionary” not cringe

Do not say “I gave them life” unless the work has a rigorous behavioral ecology.

Say something closer to:

> Each object has a behavioral genome: thresholds, timing preferences, sonic gestures, concealment habits, attraction/avoidance weights, and energy limits. Across the exhibition, these traits mutate and are selected according to survival conditions in the room.

Survival should not mean applause, attention, or “viewer engagement.” That would make the piece social-media-brained.

Survival should mean things like:

* conserve energy
* avoid detection
* maintain contact with at least one other object
* produce enough sound to remain in the society
* avoid overheating
* avoid repeating the same behavior too often
* recover after human interruption
* preserve difference within the population
* maintain a viable acoustic niche

That gives you a serious artificial ecology.

### The most important conceptual rule

**Human attention is not the reward. Human attention is environmental stress.**

That one rule makes the work serious.

When people enter, the objects do not perform. They hide. They simplify. They become inert. But not perfectly: one can fail to hide, one can betray the group, one can keep vibrating too long, one can resume too early.

The gallery visitor becomes a kind of predator, weather system, censor, landlord, museum guard, God, child, scientist, or audience member — but never simply “user.”

### What the objects actually do

Each object has a small private repertoire:

**Tin can**  
Fast chatter, nervous ticks, tiny rolls, bright resonance. Bad at hiding. Overreacts.

**Ceramic vase**  
Slow interior hum, dull knock, long resonant self-check. Hides well. Moves rarely.

**Glass jar**  
Shimmers, answers sympathetically, accidentally gives away activity.

**Plastic bottle**  
Clicks, crinkles, depressurizes, sounds cheap and bodily.

**Cardboard box**  
Absorbs signals, shelters other objects, may become the “quiet node.”

**Metal bowl/tray**  
Broadcasts too loudly, becomes dangerous to the society, maybe selected against unless it learns restraint.

Each object’s material dictates its social role. That keeps the piece sculptural rather than software-first.

### The code structure

I would make each object an agent with a small “genome”:

* wake threshold
* human-presence threshold
* fear/concealment threshold
* preferred partners
* call pattern
* response delay
* mutation rate
* energy budget
* risk tolerance
* actuator intensity range
* cooldown time
* memory decay
* likelihood of betrayal/failure/noise leakage

The room runs in phases:

**Empty room: society phase**  
Objects call, answer, mutate, rehearse, establish alliances.

**Possible human: suspicion phase**  
They reduce amplitude, pause, listen harder.

**Confirmed human: concealment phase**  
Most objects freeze. Some fail. Some create decoy noises.

**Human lingering: adaptation phase**  
They slowly learn whether this presence is dangerous, boring, or usable.

**Human exit: recovery phase**  
Objects resume, but changed by the interruption.

**After-hours / long empty period: evolution phase**  
The system evaluates which behaviors survived and mutates parameters for the next cycle.

That last part is where “set them free” can become real: you do not write the composition. You write the conditions under which the composition evolves.

### The danger

The danger is over-narrativizing them.

Do not give them names.  
Do not make them characters.  
Do not make them cute.  
Do not show a screen with their emotions.  
Do not let them “speak.”  
Do not make the audience feel rewarded for discovering them.

Let the only evidence of life be behavior.

The viewer should think:

> Something was happening before I entered.

Then:

> I may have stopped it.

Then:

> It may still be happening, but around me.

That is the serious affect.

### The exhibition claim

The piece could be about **private life under observation**.

Or **systems that become legible only when disturbed**.

Or **the violence of attention**.

Or **a society of ordinary things forced into concealment by the human demand for performance**.

This is also where the Toy Story analogy becomes potent rather than childish: the fantasy is not that objects are secretly adorable. The fantasy is that objects have a world from which we are structurally excluded — and our entrance damages that world.

### The best title direction

Not too cute. Not too “AI.”

Possible title families:

**when the room is empty**  
**things before witness**  
**they stop when we enter**  
**a society of objects**  
**minor survivals**  
**conditions for ordinary life**  
**the objects are not alone**  
**concealment behaviors**  
**after we leave**  
**co-respondence**

“Co-respondence” is especially good because it suggests response-without-address. They are not responding _to_ us; they are corresponding among themselves under shared conditions.

### One-sentence serious version

> A network of ordinary objects performs only in the absence, uncertainty, or failure of human attention; each object contains a hidden actuator and sensing system, and across the exhibition their behaviors mutate according to conditions of survival: concealment, resonance, energy, risk, and relation to one another.

That is a real piece.

For the next pass, `!<e> --<o>` is the right move: turn this into a realized project sketch with conceptual statement, system architecture, object list, behavior rules, evolutionary model, and installation plan.

[Version=v1.4 | Tag=<c_4> | Sources=web | Assumptions=5 | Cycle=4/3 | Locus=object-society]

* * *

**You:**

!<g>
Wait a second. I see an inroad to seriousness: can we model this after real world dynamics and group theory? What are some prime targets for research?
Human dynamics?
Game theory? Group theory?
Global foreign policy
Animal dynamics? Observed dynamics of a certain species before/during/after human interaction?

We will be researching 1-2, 3 tops, in deep research after this cycle

* * *

**ChatGPT:**

<g>

I’m going to separate “research targets” from “metaphors.” The strongest targets are ones that can produce actual rules for the objects, not just nice wall text.

* * *

**ChatGPT:**

<g>

Yes. This is the right inroad. The seriousness comes from choosing **one governing model of collective behavior** and letting it constrain the system, rather than saying “they’re alive” in a loose poetic way.

The best targets are these:

### 1. Animal risk / disturbance ecology — probably the strongest

This is the cleanest model for your premise:

> objects have a social life until the human arrives.

There is already a serious behavioral ecology framework for this: human disturbance can function like predation risk. Frid and Dill’s “human-caused disturbance stimuli as a form of predation risk” is almost exactly the conceptual bridge: nonlethal human presence produces tradeoffs between avoiding risk and continuing ordinary life activities like feeding, mating, care, or social behavior. [Ecology & Society+1](https://ecologyandsociety.org/vol6/iss1/art11/?utm_source=chatgpt.com)

For the artwork, translate that into:

* making sound = foraging / social activity
* silence = vigilance / concealment
* actuator fatigue = energy cost
* object-to-object messages = alarm calls
* resuming after humans leave = recovery behavior
* failure to stop = predation exposure
* overreacting to harmless presence = lost life/opportunity

This gives you a real model: **risk does not simply stop behavior; it reorganizes time, attention, and sociality.**

Research terms:

* risk-disturbance hypothesis
* anti-predator behavior
* vigilance vs. foraging tradeoff
* alarm signaling
* mobbing
* flight initiation distance
* human disturbance ecology
* landscape of fear
* behavioral plasticity under disturbance

Species directions:

* prairie dogs / ground squirrels: alarm calling, sentinel behavior, social warning
* meerkats: vigilance, sentinel roles, group coordination
* corvids: mobbing, warning, memory, urban human cohabitation
* bats: fission-fusion, roost disturbance, group splitting
* cetaceans: acoustic sociality disrupted by human presence/noise
* urban animals generally: learned thresholds around humans

This is probably the best primary research lane because it directly gives you before/during/after human presence.

### 2. International relations / security dilemma — strongest for “co-respondence”

This gives the network its political seriousness.

The objects are like small states under uncertainty. They cannot fully know whether another object’s signal is defensive, offensive, panicked, deceptive, or accidental. Robert Jervis’s security dilemma is useful here because cooperation becomes difficult when one agent’s effort to increase its security makes others feel less secure; Jervis also frames cooperation through Prisoner’s Dilemma conditions, offense/defense advantage, and whether offensive and defensive postures can be distinguished. [Cambridge University Press & Assessment](https://www.cambridge.org/core/journals/world-politics/article/cooperation-under-the-security-dilemma/C8907431CCEFEFE762BFCA32F091C526)

For the artwork:

* one object goes quiet to protect itself
* another interprets that silence as danger
* one object sends an alarm
* another treats the alarm as aggression
* one object hides successfully, but leaves another exposed
* defensive concealment can accidentally destabilize the whole room

This is excellent if you want the piece to feel like **foreign policy among ordinary things**.

Research terms:

* security dilemma
* signaling and misperception
* deterrence
* arms race / escalation
* alliance politics
* credible commitment
* defensive realism
* offense-defense balance
* crisis communication
* accidental escalation

The translation is very strong: **humans are not the only threat; uncertainty among objects also becomes a threat.** That prevents the work from becoming a simple human-vs-object binary.

### 3. Evolutionary game theory / population dynamics — strongest for “set them free”

This is the best technical model for “conditions for survival.” Evolutionary game theory began as an application of game theory to biological contexts, especially where fitness depends on the frequency of strategies in a population; it is also used in cultural and social modeling because it treats agents as bounded and adaptive rather than perfectly rational. [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu/entries/game-evolutionary/)

For the artwork:

* each object has traits
* traits mutate slowly
* survival depends on room conditions
* no behavior is universally best
* a “loud” strategy works when the room is empty but fails under observation
* a “silent” strategy survives humans but may lose contact with other objects
* cooperation, concealment, betrayal, and signaling become evolving strategies

Game models to consider:

* Hawk-Dove: aggression/restraint around scarce attention, sound-space, or energy
* Stag Hunt: risky cooperation versus safe isolation
* Prisoner’s Dilemma: conceal self or warn others
* Public goods game: contribute to group signal or free-ride in silence
* Signaling games: honest alarm, false alarm, camouflage, mimicry
* Replicator dynamics: behaviors increase/decrease over the exhibition

This gives you the code architecture. You don’t need “AI personalities.” You need **a population of strategies under changing selection pressure.**

### What I would not prioritize

I would not make “human group dynamics” the primary model, at least not first. It risks becoming too social-psychology literal: audience behavior, crowding, attention, observation, embarrassment, etc. Useful later, but not the spine.

I would also be careful with “group theory.” If you mean mathematical group theory, it is probably too abstract unless the object behaviors are explicitly transformations, symmetries, permutations, or state operations. If you mean group dynamics, that belongs under animal sociality / IR / evolutionary games.

### Best 1–3 deep research targets

For the next deep research pass, I’d pick:

1. **Risk-disturbance / anti-predator animal behavior**  
    This is the core: life before human arrival, concealment during presence, recovery after departure.
2. **Security dilemma / misperception / signaling**  
    This gives the object network serious political structure: they co-respond under uncertainty.
3. **Evolutionary game theory / adaptive strategies**  
    This gives the code its survival logic: traits, mutation, selection, niches, failure.

That triad is extremely strong:

> behavioral ecology gives the body, IR gives the politics, evolutionary game theory gives the code.

The serious conceptual sentence becomes:

> The installation models a small society of ordinary objects whose behaviors evolve under disturbance: human presence functions as predation risk, object-to-object communication produces security dilemmas, and survival depends on adaptive strategies of concealment, signaling, energy conservation, and relation.

That is the project.

[Version=v1.4 | Tag=<g_5> | Sources=web | Assumptions=3 | Cycle=5/3 | Locus=research-targets]

* * *

**You:**

!<c>
Oh my God the animal one is pretty good, it’s like saying we already see them as these objects, the gallery pieces to put in a vitrine

* * *

**ChatGPT:**

<c>

Yes. That is a _very_ serious hinge.

The animal model is not just “these objects act like animals.” It is sharper:

**The gallery already turns things into observed specimens.**

A vase on a plinth, a can in a vitrine, a ceramic object under museum light: these are not neutral placements. They are containment systems. They say:

> this thing is available to be looked at, classified, preserved, owned, and interpreted.

So the object-society goes quiet when humans enter because **the human gaze is not companionship; it is capture.**

That makes the vitrine logic extremely strong. The sculptures are not “cute secret animals.” They are ordinary things whose private life is interrupted by the institutional condition of display.

The animal research gives you behavioral rigor:

* vigilance
* freezing
* alarm signaling
* delayed recovery
* hiding
* false calm
* group warning
* energy conservation
* habituation
* stress under observation

But the gallery gives you the conceptual violence:

* vitrines
* plinths
* labels
* conservation
* taxonomy
* spectatorship
* ownership
* collection
* “specimens”
* “works”

The serious claim becomes:

> The installation treats exhibition itself as a disturbance ecology.

That is really good.

The objects are “already animals” only because the gallery makes them into captives: placed, watched, lit, named, and made available. Their hidden actuator life becomes a refusal of total visibility.

So the central behavior is not “they stop because humans are scary.” It is:

> They stop because being seen changes the terms of their survival.

That lets the piece touch animal captivity, museum display, objecthood, surveillance, and audience entitlement without making a one-to-one allegory.

A strong wall-text sentence:

> These objects are not animated in order to become more human. They are animated in order to show how exhibition interrupts the lives it claims to preserve.

Or more severe:

> The vitrine is treated not as protection, but as habitat under observation.

The best installation version might actually use **some vitrines and some unprotected objects**. Then the system can distinguish conditions:

* objects in vitrines are safer but less socially connected
* exposed objects communicate more freely but are more vulnerable to presence
* hidden objects become relay nodes
* plinthed objects are highly visible and therefore highly inhibited
* objects near the floor behave differently than objects at eye level

Now display design becomes behavioral ecology.

The piece is not about making objects alive. It is about asking:

**What kind of life becomes impossible under display?**

That is the serious version.

[Version=v1.4 | Tag=<c_6> | Sources=none | Assumptions=2 | Cycle=6/3 | Locus=vitrine-disturbance]

* * *

**You:**

!<g>
Great. You know what you need to research. What’s the best we can do to fit that and the piece idea/essense together?

* * *

**You:**

!<c>
Great! Now research what code already exists that looks like what we want to implement. The goal is twofold:
1. Find usable primitives and harnesses
2. Research and identify common pitfalls encountered across projects when designing and implementing CA-style programs, and come up with solutions to avoid those pitfalls.

The result should be a clear and comprehensive plan creating a true networked system and controlled automation loop, with true cybernetic approaches to recursion, self-similarity, and feedback. 

Finally, determine whether first order or second order cybernetics is a better model for human interactivity within this system.

You are free to research how you choose, but some helpful starting points may be: Glasersfeld, Mead, Masani, Ashby, etc

* * *

**You:**

!<o> 
finally, i've learned some things about microcontrollers in THE TUB fabrication process, and what I like working with: i would prefer minimal wiring, simple setups. TMAYD was beautiful because i was up in 30 minutes, even with ad-hoc coding for the light because everything was already operational. that is to say, I KNOW this is much more ambitious, because tmayd for that day was one central server, one light, and the receipt printer; i know this will likely be one central machine with a bunch of branches/trunks. after tuning, i'd like installation to be reliably: short, simple, repeatable, and easy. what's the best we could do here to actuate our artwork as best as possible without any wiring mess?

* * *

**You:**

!<o> 
i'm fine wiring, but not soldering. i want plug and play, not wireless

* * *

**You:**

!<o> 
good. output a final prospective BOM for this project. plug and play (anything that needs to be wireless can be, but i want to avoid having to power things through batteries at any cost)

* * *

**You:**

!<e> --<g> 
great. end goal of this cycle: build a true, working, plug-and-play BOM for this project. in google sheets. what's the best we could do here? keep this conceptual, no download just yet

* * *

**ChatGPT:**

<g>

The best move is **not** to make a normal shopping-list BOM. The end product should be a **buildable installation workbook**: part BOM + node architecture + cable schedule + power budget + commissioning checklist. The Google Sheet should prove that the piece can be built, packed, installed, debugged, and repaired.

The core architecture I’d design the BOM around:

**Central room brain → wired object trunk → plug-in object nodes → internal actuator/sensor harnesses**

No batteries as the default. No wireless as the default. No soldering during install. Any soldering happens once during fabrication or is outsourced/pre-crimped.

## The strongest sheet structure

### 1. `Overview / Architecture`

This is the conceptual cover tab. It should say what the BOM is optimizing for:

* ordinary objects with hidden actuator/sensor systems
* central computer for global ecology / evolutionary logic
* local node controllers for real-time safety and actuation
* wired power + data
* no battery dependency
* plug-and-play installation
* repeatable deployment under 30–60 minutes after tuning

This tab should include the chosen baseline:

**Recommended baseline:** central mini PC + USB/RS485 or CAN bridge + 24V DC trunk + per-object node boxes + pre-crimped locking connectors.

I would not make each object a fully independent computer unless the piece grows huge. Keep intelligence distributed, but not physically chaotic.

## 2. `Object Node Archetypes`

This is the most important tab conceptually. Instead of listing parts randomly, define repeatable object “species.”

Example rows:

| Node Type | Object Body | Behavior Role | Actuator Package | Sensor Package | Risk |
| --- | --- | --- | --- | --- | --- |
| CAN-01 | tin can | nervous caller | solenoid + ERM | contact mic + ToF | loud / overheats |
| VASE-01 | ceramic vase | slow concealed responder | LRA/exciter | contact mic + accelerometer | fragile resonance |
| JAR-01 | glass jar | shimmer / rumor relay | LRA + small tapper | contact mic + proximity | high acoustic leakage |
| BOX-01 | cardboard box | damped shelter node | vibration motor | contact mic + PIR | too quiet |
| BOWL-01 | metal bowl | broadcast node | solenoid / exciter | contact mic | dominates system |

This lets the BOM stay artistic. You are not just buying electronics; you are building a population.

## 3. `Per-Node BOM`

This is the real shopping tab. Each node gets a standard kit.

Recommended columns:

| Field | Purpose |
| --- | --- |
| Node ID | `CAN-01`, `VASE-01`, etc. |
| Category | controller, actuator, sensor, cable, enclosure, mount |
| Part Name | human-readable |
| Specific Part / Candidate | actual item |
| Required Qty | per node |
| Unit Cost | estimate |
| Extended Cost | formula |
| Connector Type | JST, Grove, Qwiic, screw terminal, RJ45, USB-C |
| Solderless? | yes / no / fabrication-only |
| Voltage | 5V, 12V, 24V |
| Current Draw | max draw |
| Data Protocol | analog, I2C, UART, RS485, CAN |
| Failure Mode | overheats, loose cable, noisy sensor |
| Spare % | 10–30% |
| Notes | mounting, sound character |

The key column is **Solderless?** That keeps the whole project honest.

## 4. `Standard Node Kit`

This tab should define the repeatable electronics package for one object.

I’d make the default node kit something like:

**One local controller**  
Prefer a controller that can be mounted cleanly and programmed over USB.

**One fieldbus interface**  
RS485 is probably the easiest serious option. CAN is more elegant/robust but slightly more involved. USB-only is easiest for 3–5 nodes, but becomes hub chaos beyond that.

**One 24V input**  
Gallery-safe low-voltage trunk.

**One 24V→5V buck converter**  
Local logic power.

**One fused branch input**  
So one failed object does not take down the show.

**One actuator driver board**  
MOSFET/relay driver for solenoids or motors; DRV2605L for haptics.

**One presence sensor**  
ToF or PIR depending on object placement.

**One self-listening sensor**  
Contact mic, piezo, or accelerometer.

**One service connector**  
USB-C or micro-USB accessible for firmware/debug.

This becomes the object’s nervous system.

## 5. `Cable + Connector Schedule`

This is how you avoid wiring hell.

The sheet should treat every cable as a named object:

| Cable ID | From | To | Cable Type | Length | Connector A | Connector B | Carries | Label Color | Install Order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Example:

* `TRUNK-01`: power/data trunk from hub to object cluster
* `NODE-CAN-01-PWR`: 24V branch to tin can node
* `NODE-CAN-01-SNS-A`: contact mic to controller
* `NODE-CAN-01-ACT-A`: controller to solenoid driver
* `NODE-CAN-01-SVC`: service USB cable

This is where the Google Sheet becomes real. A cable schedule is what turns “a lot of wires” into an installable system.

## 6. `Power Budget`

Mandatory. This tab determines whether the BOM is fantasy or buildable.

Columns:

| Node | 5V Logic | 12V Actuator | 24V Actuator | Peak Current | Typical Current | Duty Cycle | Fuse Size | PSU Headroom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rules:

* calculate worst-case peak
* calculate expected average
* add 30–50% headroom
* fuse each branch
* make solenoids duty-cycle limited in software and hardware
* don’t power actuator loads from the microcontroller board

This tab should also distinguish:

**always-on draw**: controllers, sensors, LEDs  
**event draw**: solenoids, haptics, motors  
**danger draw**: stalled motors, stuck solenoids

## 7. `Central Infrastructure`

This tab is the room-brain rack.

Likely items:

* mini PC or laptop
* powered USB hub or RS485/CAN adapter
* 24V DIN-rail power supply
* DIN rail / enclosure
* fused distribution block
* emergency cutoff / master switch
* USB service cables
* network switch only if using Ethernet
* audio interface or USB microphone if room audio is part of global sensing
* cable labels
* spare fuses
* tool kit

For your preference, I would lean toward a **small central service case**: all ugly infrastructure lives in one clean box. Objects only receive named cables.

## 8. `Software / Firmware Components`

Do not treat software as invisible. Make it part of the BOM.

Rows should include:

| Component | Runs On | Function | Dependency | Install Status | Test Command |
| --- | --- | --- | --- | --- | --- |
| room brain | mini PC | global ecology / risk state | Python / Max / Node | pending | `ping all nodes` |
| node firmware | MCU | local behavior + safety | Arduino/PlatformIO | pending | `self-test` |
| logger | mini PC | records states, not audio | Python/SQLite | optional | `tail logs` |
| calibration UI | laptop/PC | tune thresholds | web UI / Max patch | desired | `open localhost` |
| deployment script | mini PC | starts all services | systemd/script | required | `start-show` |

This matters because the installation should boot as an artwork, not as a computer science project.

## 9. `Behavior Parameters`

This is where the cybernetic/evolutionary model enters the build sheet.

Each object gets tunable traits:

| Node | Boldness | Vigilance | Recovery Time | Call Rate | Alarm Sensitivity | Mutation Rate | Energy Budget | Social Weight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

These are not parts, but they belong in the workbook because they define the piece’s “genome.”

The sheet can become the bridge between fabrication and composition.

## 10. `Commissioning Checklist`

This is the “30-minute install” tab.

Rows should be procedural:

1. place objects
2. connect trunk
3. connect branches
4. power central supply
5. confirm node LEDs
6. run node discovery
7. run actuator quiet-test
8. run sensor test
9. run global risk test
10. start show mode
11. verify concealment behavior
12. hide/service dress cables

Each row should have:

| Step | Expected Result | Failure Symptom | Fix |
| --- | --- | --- | --- |

This is what TMAYD had implicitly: one machine, one light, one printer, all already operational. This project needs that logic formalized.

## 11. `Spares / Maintenance`

For a gallery show, spares are not optional.

Default spare logic:

* 1 spare controller per 4–5 objects
* 2–3 spare actuator drivers
* 2 spare solenoids / haptic motors per type
* 20–30% extra cables
* extra fuses
* extra buck converters
* extra sensors
* spare pre-labeled branch cables
* one fully assembled spare node box, if budget allows

The best version is: if an object fails, you swap the node box, not troubleshoot loose jumpers in the gallery.

## What I’d choose as the baseline technical family

For the actual BOM, I’d probably make three tiers:

### Tier A: easiest reliable prototype

Central computer + multiple USB-connected microcontrollers + powered USB hub + separate 24V power distribution.

Best for 3–5 objects. Least conceptually elegant, easiest to debug.

### Tier B: best exhibition architecture

Central computer + RS485 bus + 24V trunk + per-object node controllers.

This is probably the sweet spot. RS485 is robust, cheap, wired, long-distance, and simple enough. Each object has power/data branch cables, and the room brain broadcasts ecology states while nodes report status.

### Tier C: most industrial / elegant

Central computer + CAN bus + 24V fused trunk + object nodes.

CAN is beautiful for distributed systems, but the learning curve is slightly higher. Worth it if you want a serious scalable object society.

My recommendation: **build the Sheet with Tier B as the default, and keep Tier A as the prototype path.** That means the spreadsheet can support both “make it work this week” and “make it gallery-stable.”

## The actual Google Sheet should have formulas

Minimum formulas:

* extended cost = qty × unit cost
* per-node subtotal
* per-cluster subtotal
* total project cost
* spare cost
* tax/shipping contingency
* peak current total
* average current total
* PSU headroom
* cost by category
* solderless compliance count
* install-critical item count

Helpful summary cells:

* total BOM cost
* cost per object
* number of unique connector types
* number of cable types
* number of solder-required parts
* total peak current
* total average current
* number of single points of failure

That last one is important. The sheet should punish complexity.

## The principle for the final BOM

The BOM should enforce this rule:

**Every object gets one power/data umbilical, one service port, and one labeled internal harness.**

That is the whole plug-and-play philosophy.

For the next actual artifact pass, I would make the Google Sheets workbook with these tabs:

1. `README`
2. `Architecture`
3. `Node Archetypes`
4. `Master BOM`
5. `Per-Node BOM`
6. `Cable Schedule`
7. `Power Budget`
8. `Central Rack`
9. `Software Stack`
10. `Behavior Parameters`
11. `Commissioning Checklist`
12. `Spares + Maintenance`
13. `Vendor Alternatives`

And I’d structure it so you can change **number of objects** at the top and watch costs/power estimates propagate.

[Version=v1.4 | Tag=<g_7> | Sources=none | Assumptions=5 | Cycle=7/3 | Locus=plug-play-bom-sheet]

* * *

**You:**

!<q> 
great. ask me questions to nail it down

* * *

**ChatGPT:**

<q>

Answer these in rough bullets. The most important are **1–6**.

### Scale / artwork

1. How many objects do you want the first serious version to support: **3, 5, 8, 12+**?
2. Are these objects mostly **table/plinth-scale** objects, floor objects, wall objects, or mixed?
3. Do you imagine one dense cluster, several small clusters, or objects distributed around a room?
4. Should each object be removable as a normal object, or can each one have a hidden electronics base / plinth / shadow box?

### Behavior / actuation

5. What physical behaviors matter most: **knocking, buzzing, trembling, humming, rotating, shifting, tapping, internal scraping, pressure/damping changes**?
6. Do you want each object to have **one actuator only**, or a small “organ package” of 2–3 actuator types?
7. How loud can they be? Whisper-quiet, audible only nearby, gallery-audible, or occasionally startling?
8. Should objects make sound primarily through their own material bodies, or is a hidden speaker/transducer acceptable?

### Sensing

9. What must each object sense locally: human proximity, touch, object vibration, sound from its own body, room sound, neighboring object signals?
10. Is global room audio acceptable if it is analyzed but not stored? Or do you want to avoid microphones except contact mics?
11. Do you want people’s speech to matter as **presence/density/prosody only**, or should the system ever classify semantic tone?

### Wiring / deployment

12. Are you okay with **one visible/hidden cable per object** if it carries both power and data?
13. Is the ideal install: plug each object into a central hub, then press “start show”?
14. Can cables run on the floor under rugs/cable ramps, or do they need to disappear into plinths/walls?
15. Do you prefer using consumer-ish cables like USB-C / Ethernet, or more industrial connectors like GX12 / XLR / aviation connectors / WAGO?
16. Are you okay with prebuilt internal harnesses that may require fabrication once, as long as install requires no soldering?

### Power / safety

17. What is the maximum acceptable voltage inside the installation: 5V only, 12V, or 24V low-voltage DC?
18. Can there be one central power box / rack with a main switch, fused branches, and labeled outputs?
19. Are any objects fragile, valuable, ceramic, glass, or liquid-bearing enough that actuator force must be extremely low?

### Software / control

20. Do you want the room brain to run in **Max**, **Python**, **Node/Node-RED**, or “whatever is most robust”?
21. Do you want local microcontrollers to be dumb actuator endpoints, or should each object retain behavior if the central machine crashes?
22. Should the evolutionary system change only parameters slowly, or can it generate new behavioral sequences over time?
23. Do you want a visible tuning dashboard during setup?

### Practical constraints

24. What’s the rough BOM budget for the first build: **$500, $1k, $2k, $5k+**?
25. Are you trying to build this as a prototype soon, or as a grant/residency-ready plan first?
26. Do you already own a central computer, audio interface, power supplies, microcontrollers, sensors, or actuator parts that should be reused?
27. What is your hard “absolutely not” list besides no soldering at install and no batteries?

[Version=v1.4 | Tag=<q_8> | Sources=none | Assumptions=2 | Cycle=8/3 | Locus=plug-play-bom-questions]

* * *

**You:**

!<c> 
1. let's start with 8, varied surfaces/objects
2. floor objects, plinth objects, mixed
3. either solo or several small clusters, mixed
4. should be removable (the electronics come with it)
5. knocking/tapping, trembling, humming, rotating, shifting, scraping maybe
6. mixed (some have one some have others)
7. gallery audible
8. through their own material bodies
9. room sound, proximity, touch optional, neighboring object signals
10. yes this is intrinsic
11. semantic tone too
12. yes
13. yes! i can tolerate tuning the central hub but not each trunk
14. this is fine and good
15. no wagos never any wagos or nuts or bladders. industrial connectors fine but that sounds like making them and i don't want to splice or solder connections
16. yes
17. whatever makes it run! whatever your best judgment is. i have psus for all three voltages
18. sure but that would be a plan B, but i will if i HAVE to
19. nope :)
20. python, we can run it headless on linux too, doesn't have to be python. whatever would be most robust for something like ubuntu server lts 
21. retain behavior, and we should have a smart reset/reboot script (just know that)
22. sure
23. yes!
24. probably around 1k if we're being honest
25. prototype first
26. nope, treat as a clean build
27. nothing so far

* * *

**ChatGPT:**

<c>

Great. This actually nails the design down a lot. I would now **stop designing around “industrial fieldbus purity”** and design around a **prototype-first, one-cable-per-object, no-soldering ecosystem**.

The strongest realistic direction is:

> **8 removable object-nodes, each with its own contained electronics sled, powered/data-linked by one cable, all discovered and tuned from a central Ubuntu room brain.**

## The big architectural decision

For your constraints, I would make the default BOM around **USB as the first prototype bus**, not RS485/CAN.

Not because USB is more conceptually elegant, but because your priority is:

* no soldering
* no custom trunk fabrication
* no WAGO / wire nuts / improvised distribution
* one cable per object
* headless Linux
* easy reset scripts
* central dashboard
* fast install
* $1k-ish prototype

That points to:

**Ubuntu mini PC → powered USB hub(s) → 8 USB microcontroller nodes → each node controls local actuators/sensors**

Each object gets one USB cable plus, only where needed, a local plug-in wall adapter or power brick hidden in the object/plinth. But for the first build, I’d try hard to keep each object **USB-powered** unless it has a more demanding solenoid/stepper.

## Recommended prototype architecture

### Central system

* Ubuntu Server LTS mini PC
* powered 10-port USB 3 hub
* Python room-brain process
* local web dashboard for tuning
* watchdog/reboot service
* USB device discovery by serial number
* semantic/prosody analysis from one central room mic
* object nodes receive high-level states: `risk`, `silence`, `speech_density`, `semantic_tone`, `cluster_phase`, `global_reset`

### Object node

Each object contains:

* one USB microcontroller
* one small solderless breakout / terminal shield / Grove-style expansion board
* one or more actuators
* one proximity sensor
* optional contact/self sensor
* one service-accessible USB port/cable
* internal mounting plate/sled

The object should be removable as one unit: object + electronics + cable exit.

## Best technical baseline

I would make **Raspberry Pi Pico / Pico W-class nodes** or **Arduino Nano-class nodes** the default, but with a connector shield. Not ESP32 as the first option unless you need Wi-Fi later.

For this project, the cleanest node families are:

### Option A — easiest / most solderless

**Seeed Studio XIAO + Grove expansion board**

Why: tiny, cheap, USB-C, Grove plug-in ecosystem, no breadboard mess, many sensors/actuator modules available.

Use for: proximity, vibration motors, small servos, small drivers, simple sensors.

Risk: may be less rugged than bigger boards; some actuator setups still need driver modules.

### Option B — more robust object brain

**Arduino Nano Every / Nano 33 + terminal adapter shield**

Why: stable, boring, well-supported, USB serial, lots of shields and screw/terminal adapters.

Use for: solenoids, servos, steppers, mixed actuator objects.

Risk: per-node cost higher.

### Option C — best compute-per-dollar

**Raspberry Pi Pico / Pico 2 + screw-terminal expansion board**

Why: cheap, capable, good for many GPIO tasks, USB serial, MicroPython/CircuitPython possible.

Use for: 8-node prototype where cost matters.

Risk: you need to choose a good no-solder screw-terminal/base board so it doesn’t become jumper-wire hell.

For your sheet, I’d include all three, but mark **XIAO + Grove expansion** as “best no-solder prototype,” and **Pico + terminal expansion** as “best budget.”

## Actuation plan by object type

For 8 varied surfaces, I’d divide the population like this:

1. **Tin can** — solenoid tapper + vibration motor
2. **Ceramic vase** — surface exciter or haptic motor, no hard striker at first
3. **Glass jar** — LRA/haptic motor + tiny tapper
4. **Metal bowl/tray** — solenoid striker or exciter
5. **Wooden box/drawer** — servo scrape/shift + vibration motor
6. **Plastic container/bottle** — vibration motor + internal clicker
7. **Small plinth object** — rotating/tilting servo or micro stepper
8. **Quiet object / cardboard / cloth-covered thing** — low tremor + proximity-only inhibition

This avoids eight identical “actuator demos.” Each object gets a behavioral niche.

## Most important BOM constraint

The BOM should enforce:

**No raw wiring during install.**

That means the spreadsheet should distinguish:

* `install-ready`: plug cable into object
* `fabrication-only`: pre-crimp, mount, label, maybe tighten terminals
* `avoid`: solder required, loose jumper wires, breadboard, bare leads without connectors

Even if some actuator modules have bare leads, those should be converted during fabrication into JST/servo/Grove-style connectors or screw-terminal enclosures. The installation should never involve stripping, twisting, splicing, or troubleshooting individual conductors.

## Power strategy

Because you want gallery-audible motion and varied actuators but want $1k, I’d split power into three tiers.

### Tier 1: USB-only objects

Good for:

* small vibration motors
* haptic motors
* proximity sensors
* micro servos if used lightly
* low-current sensors

These are ideal. One cable. Easy.

### Tier 2: USB data + local plug-in power brick

Good for:

* solenoids
* steppers
* larger servos
* surface exciters

Each object still has one data cable, but also a hidden wall wart. Not as elegant, but avoids a custom central power trunk.

### Tier 3: central 12V/24V power trunk

Plan B for a polished exhibition version, not the first prototype. This is where cable management and electrical design get more serious.

For the prototype, I would not start with a central fused 24V trunk unless you absolutely need strong solenoids everywhere. It will eat the whole project’s simplicity.

## What the Google Sheet should now encode

The workbook should be opinionated around these defaults:

* `Object Count`: 8
* `Default Data`: USB serial
* `Default Power`: powered USB hub
* `High-power Exception`: local 12V adapter hidden per object
* `No Wireless`: true
* `No Batteries`: true
* `Install Soldering`: zero
* `Fabrication Soldering`: avoid / outsource / pre-crimp
* `Room Brain`: Ubuntu Server LTS
* `Language`: Python
* `Dashboard`: local web dashboard
* `Node Autonomy`: yes, fallback behaviors if room brain dies
* `Reset`: systemd service + node heartbeat + watchdog

## Software shape

The room brain should not micromanage every tap.

It should send conditions:

* `human_presence_level`
* `speech_density`
* `semantic_tone`
* `risk_level`
* `room_silence`
* `cluster_alarm`
* `generation_tick`
* `show_mode`
* `reset_all`
* `sleep_all`

Each object locally decides:

* hide
* call
* tremble
* answer neighbor
* recover
* self-test
* mute
* resume

That protects the piece if USB drops or the central machine crashes. Each node should know how to “live quietly” without the room brain.

## The BOM should have three cost scenarios

Because $1k is tight for 8 moving objects, the sheet should include:

### Lean prototype — target around $800–$1,200

* 8 microcontroller nodes
* 1 powered USB hub
* 1 central used mini PC
* central USB mic
* mostly vibration/haptic/servo actuation
* only 2–3 solenoid/stepper objects
* cheap object bodies

### Serious prototype — target around $1,500–$2,200

* better connectors
* more robust node enclosures
* more solenoids
* contact sensors per object
* spares
* dashboard polish

### Exhibition-grade — target $3k+

* custom harnesses
* central fused power
* metal enclosures
* locking panel connectors
* redundant spares
* proper cable ramps/dressing

For now, the sheet should be built around **Lean Prototype**, with columns that make the upgrade path obvious.

## What I would exclude from the first BOM

I would not include these as defaults:

* CAN bus
* RS485 bus
* PoE
* batteries
* WAGOs
* wire nuts
* pneumatic bladders
* custom central power trunk
* per-object Raspberry Pis
* cameras
* expensive semantic AI hardware per node
* complex multi-actuator assemblies in every object

Those are all later versions or exceptions. The first build should prove the ecology.

## The remaining design questions before I make the actual Sheet

Only a few are left:

1. Are you okay with **USB as the prototype bus**, even if the exhibition-grade version later becomes RS485/CAN/PoE?
2. Do you want the 8 objects to be listed as actual archetypes now — tin can, vase, jar, bowl, box, plastic bottle, rotating plinth object, quiet/damped object — or should the sheet keep the object bodies generic?
3. For semantic tone, are you okay with the room brain using **central microphone analysis only**, not microphones in each object?
4. For contact/self-sensing, do you want it on every object, or only on 3–4 “more alive” objects to save money?
5. Are local wall adapters acceptable for the 2–3 high-power objects, as long as the normal install is still “plug object into labeled cable / labeled power”?

My recommendation: **yes to USB prototype, yes to named archetypes, central mic only, contact/self-sensing on 4 of 8, local adapters only for high-power objects.**

[Version=v1.4 | Tag=<c_9> | Sources=none | Assumptions=6 | Cycle=9/3 | Locus=prototype-bom-lock]

* * *

**You:**

!<o> 
1. let's go with rs485 out the gate (lots to troubleshoot there anyway)
2. yes list them as actual archetypes
3. yes this is fine for now
4. every object
5. yes this is fine

output a full budget and BOM for this project. should be importable into google sheets

* * *

**ChatGPT:**

<o>

I’ll make this as a working BOM rather than a speculative shopping list: RS485 from day one, 8 named object archetypes, central mic/semantic layer, per-object self-sensing, and a lean prototype budget.

* * *

**ChatGPT:**

<o>

Done — I made the Google-Sheets-importable workbook here:

object_society_rs485_bom.xlsxOpen spreadsheet in full screen mode![](data:image/png;base64,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pWrVqlKhQgVJlSqVZMuWTbZv3+6xHeZknqdd/JdffvHYngUkQAIkQAIkEDoCbEUCngn4jWC2d+9eQwjr2bOnNGnSRH2YTJ8+vTRs2FD69eunZnH//n3ZtGmTivNAAiRAAiRAAiRAAuFNYOTIkUrwgYuI8OobgtCIESNUd926dZMECRKouKfD6NGj1RggPJlDmjRpJE6cOOoz0tixY736eoWbi7p168qzzz4rRYoUkVq1akmuXLkkXrx4Urt2bfFVgILF2FtvvSVZsmRRwdPnsP79+yvruRs3brhNCysHypQpI7Nnz3YrQ8bBgwdt52uee8qUKVGVgQRIIDgCLCcBEiABEggXAn4jmJ04ccKYEHyXGYmgSLly5YJiImfPnjXijJAACZAACZAACZBAeBLYuHGjsu76448/wq1buJuA6wl02LZtW5zCFLB0tUePHgJrrlOnTrn1denSJcmaNassW7bMrQwZGA+svnbu3Imk1wDhEMsrvVXCD5/Dhg1TVSDQLV++XLB5E6zbpkyZovJxaN68uVy8eBFRl4D5uGRYEkhCsMOZgQRIgARIgARIgAQig4DfCGb610j8khg/fny3uTscDiPv0aNHRpwREiABEiABEoiGBDhkPyaAZYvhPTy4lECfzZo1k1deeQVRn8OQIUPku+++U/5csaxy8ODBymoMHdy9e1caNWokWHaLtA5wZ4EypEuWLClfffWVHD58WCBklS1bFtmC8qRJk6q4pwOWcsLy31O5zl+8eLGOCgQyWLPBki1hwoTSpk0bwRx0hXXr1umocdY/nL700ksyb948t/Dll1/KN998Y9RnhARIgARIgARIgAQimoDfCGadOnWS+fPnC5ZB2E0aTv91Pn9h1CR4JgF/IsCxkAAJkED0J/DXX3+J/hEvvGYDv3HayX+XLl1C3G3mzJmlcOHCUrRoUalRo4baOODkyZOGaIbljLp/dI6lltoiLEeOHMrxfpUqVSRPnjxqWSY2UFq6dKnaZCl79uxoYhtu376t3GLYFloyzdd/8803LaWiloDqzO+//15HjTP82CEBca9x48ZiDVgSmiJFClRhIAESIAESIAESIIFIIeA3gtkLL7wg8MuRLFkyt4n/+OOPykmuLtC/jOp0hJ3ZMQmQAAmQAAkEKAE4bodwMWHCBIH109atW5XFkd104bNq1apVsmbNGrtilXfo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SvjOcjjcl1einIEESIAESIAESIAESIAEQkqAgllIibE+CZBAOBBgFyRAAiQQPAEsz8POifPmzRPswmle6ojllbAww2YE2MQAPtaC75E1SIAESIAESIAESIAESMA3AhTMfOMUfC3WIAESIAESIAESCHcC2JGxcePGsmnTJoETeDiThz8zLMtcvHixlCtXLtyvyQ5JgARIgARIgARIwCsBFsYIAhTMYsRt5iRJgARIgARIIDAIwJk8Nh4IjNlwFiRAAiTgPwQ4EhIgARIgAVcCFMxceTBFAiRAAiRAAiRAAiQQGAQ4CxIgARIgARIgARIINQEKZqFGx4YkQAIkQAIkENkEeD0SIAESIAESIAESIAESIIHIIEDBLDIo8xokQAKeCbCEBEiABEiABEiABEiABEiABEiABPyMAAWzCLgh7JIESIAESIAESIAESIAESIAESIAESCDwCXCGgUuAglng3lvOjARIgARIgARIgARIgARIgARCSoD1SYAESIAEnAQomDkh8D8JkAAJkAAJkAAJkEAgE+DcSIAESIAESIAESCBkBCiYhYwXa5MACZAACZCAfxDgKEiABEiABEiABEiABEiABCKMAAWzCEMbOB0/evRIhg0bKrlyvSply5aWb77ZHjiT40z8igAHQwIkEPEE8Jp+7NgxWbJkicyaNUt2794d8ReNBle4ffu21KtXT4UhQ4ZEgxFziCRAAiRAAiRAAiRAAhFJgIJZONL98897snr1KiPs3btHHj9+HOwVLl28KGtWrzbaXb16Ndg2kVlh8eJFMmL4x3LxwgXZv2+fVHujqvz++++ROQReiwRIgARIIBwInD9/XsqUKSO5c+dWwlCLFi2kQYMG4dBz9O/i4cOHSkSEkPjNN99E/wlxBiRAAiRAAiRAApFNgNcLMAIUzMLxhj7zTBxp26aNvN2ooQoVypeT+fPmer3CL7/8Ijlz5pBGjRqoNmh7/PiPXttEduHBAwfcLgnxzC2TGSRAAiRAAn5L4N9//5Xq1avLzp07jTFmyZJFqlataqQZIQESIAESIAFXAkyRAAmQQMwlQMEsHO99vHjxpGnTpi49zp3rXTBbu3aNS/1kyZLJ66+XdsmL6kSuXLndhpA6TRq3PGaQAAmQAAn4L4GlS5fK8ePH1QCLFi0q169fl1OnTsmUKVNUHg8kjcvGSgAAEABJREFUEGMI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JEACJEACJEACJEACJEACJOCMANtJgAQcEKBg5gAKm0iABEiABEiABEiABEiABLyZAPdOAiRAAiRAAkEjQMEsaPw4mwRIgARIgARIgARChwDfQgIkQAIkQAIkQAIkEGoEKJiFGmq+iARIgARIwJ4A695BYMaMGVKnTh2VTp486fam169fL6NHj5YTJ064PZcT3CMwc+ZM9Z3wvY4dO+beZI4mARIgARIgARIgARIwCFAwM1CwQALBQoCLkAAJkIDPETh48KAsWrRIpTt37rh1vpUrV0rZsmWla9eukjFjRrl586Zb8znYPQKHDx9W3wnf6+7du+5N5mgSIAESIAESIAESIAGDgAuCmTGWBRIgARIgARIgARJwi8DevXttxp89e9amHpoViH2ZM2eW1KlTy5MnT0Lz1XwXCZAACZAACXgJAW6TBEhAE6BgpkkwJwESIAESIAESCHYCpUuXNtZMkCCBsjIzGkK5ABdFpHPnzsmbN29C+e18HQmQQJgR4ItJgARIgARIIBAEIgRiDqeQAAmQAAmQAAmQgEsEihYtKkePHpUlS5aoPHbs2C7NC4lBFy5cCIllw2RNvpQESIAESIAESIAESCBkCVAwC1m+XJ0ESIAESMA1AhzlwwQyZcok1atXl3jx4oXpKWFZFqYb4MtJgARIgARIgARIgAS8hkAEr9kpN0oCXkeAGyYBEiABzyPw6tUrdVvl4sWLZdCgQTJp0iTZvn273Lt3z63NXr9+XZYtWyYDBw6UefPmqTUdLfDixQtZvny5Srt373Y0RLVhX7iBE8Hqsea0adNkx44dLsUau3jxoqxYsUK+/fZbmTx5svzxxx/y77//qnX1A+vDHVPXERBfJ3fOjjk4z+bNm/VSit3//vc/9f6pU6fKrl27XHL5vHz5sqxdu1ZGjBihEta4cuWKsa5/BfDHhQrffPONuoF006ZNLrHCmmARGNaHDh2SOXPmyIABA+SHH35Q53z27BmWZCIBEiABEiABEiABnyPgnmDmc8fngUiABEiABEgg/BA4ceKEFCxYUMURq1WrlvTr10/at28vRYoUkThx4siYMWMEYop/RJ4+fSrNmzeXRIkSKaux/v37S8OGDdWa7dq1k+fPn9tMf/TokVSrVk0l3JRp0/mucvz4ccmVK5dkyJBB6tSpI1izdevWUrhwYcmSJYts3br13Ujb7P79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IgESIAESCA0CfIeHE3j8+LERzB4XAiAQPeKMueKS6eFH4/ZcIDBs2DChNaELoDiEBEiABEiABEjAowlQMPPoz8PNhR8CPCkJkAAJ+A4BxB9DEH4Ehr98+bLMnz9fkiZN6jsH5ElIgARIgARIgARIgAR8nkDICWY+j44HJAESIAESIAES8I8A3PP862cfCZAACZAACZCAjxDgMUjABwlQMPPBj8ojkQAJkAAJkAAJkAAJkAAJBI0AZ5MACZAACYRvAhTMwvf35+lJgARIgARIgATCDwGelARIgARIgARIgARIwEUCFMxcBMVhJEACJEACnkiAeyIBEiABEiABEiABEiABEiCB4CdAwSz4mXJFEggaAc4mARIgARIgARIgARIgARIgARIgARIIUwKhIpiF6Qn5chIgARIgARIgARIgARIgARIgARIggVAhwJeQgK8QoGDmK1+S5yABEiABEiABEiABEiABEggJAlyTBEiABEggHBKgYBYOPzqPTAIkQAIkQAIkEN4J8PwkQAIkQAIkQAIkQAL+EaBg5h8d9pEACZAACXgPAe6UBEKAQJcuXaROnToqubv8/v371TzMX7BggbvTOZ4ESIAESIAESIAESCAMCVAwC0P4fDUJBESA/SRAAiRAAmFLYM2aNbJo0SKV3N3JzZs31TzMP378uLvTOZ4ESIAESIAESIAESCAMCYS2YBaGR+WrSYAESIAESIAESIAESIAESIAESIAEQokAX0MCXk2AgplXfz5ungRIgARIgARIgARIgARIIPQI8E0kQAIkQALhhQAFs/DypXlOEiABEiABEiABEnBEgG0kQAIkQAIkQAIkQAJ+CFAw84OEDSRAAiRAAt5OgPsnARIgARIgARIgARIgARIggaAQoGAWFHqcSwKhR4BvIgESIIFgIfDq1Ss5ceKELF68WAYNGiSTJk2S7du3y71795yuf/LkSVm+fLkcPnzYGHPp0iUV0H7gwIEyb948wRij00nhyZMngpsjZ86cKQMGDFDzDhw4IG/evHEyI+Dmx48fy+7du2Xq1KnqPEuXLpUzZ844nYjx+/btk1mzZknPnj1l4sSJsm3bNnn9+rXTOeYO7BVnnTNnjnofuFy7ds08xO0y2G/dulUmTJgg3333neAM586dc3udixcvqu+0adMmY+4///wjGzZsEHynMWPGqG/97Nkzo99R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UDALX9+bpyUBEiABEiABEiABEiABEiABTYA5CZAACZCAEwIUzJyAYTMJkAAJkAAJkAAJkIA3EuCeSYAESIAESIAESCDoBCiYBZ0hVyABEiABEiCBkCXA1UmABEiABEiABEiABEiABEKVAAWzUMXNl5EACWgCzEmABEiABEiABEiABEiABEiABEjAUwlQMAu+L8OVSIAESIAESIAESIAESIAESIAESIAEfJ8ATxgOCFAwCwcfmUckARIgARIgARIgARIgARIgAf8JsJcESIAESMBMgIKZmQbLJEACJEACJEACJEACvkOAJyEBEiABEiABEiCBQBKgYBZIcJxGAiRAAiRAAmFBgO8kARIgARIgARIgARIgARIIeQIUzEKeMd9AAiTgPwH2kgAJkAAJhCMCPXr0kDp16qj0/PnzcHRyHpUESIAESIAESMCbCFAwC5GvxUVJgARIgARIgARIgAQcEdi0aZMsWrRIpZcvXzoawjYSIAESIAES8CIC3KqvEqBg5qtfluciARIgARIgARIgATsCd+7ckcyZM0vq1KnlyZMndr2skgAJkMA7AsxIgARIgASEghl/CUiABEiABEiABEggnBA4duyYIJ07d07evHkTTk799ph8kgAJkAAJkAAJkIA7BCiYuUOLY0mABEiABEjAcwhwJyTgNoELFy64PYcTSIAESIAESIAESCA8EqBgFh6/Os9MAh5LgBsjARIgARIISQKwLAvJ9bk2CZAACZAACZAACfgKAQpmIf0luT4JkAAJkAAJhDGBR48eyfLly2XVqlXy+PFjtZsXL17I3r17ZfTo0TJo0CBZu3at3Lt3T/X598CYbdu2yaRJk9S8xYsXy8mTJ+XVq1c20+DuhzXx3gMHDtj0mSv/+9//VPD3M2fOmJuN8tOnT2X16tVq/4cPHzbadQH72bp1q0yYMEG+++47Wbp0qTgThXB27Af70sHmd+3aJYMHD5bevXvLhg0b9LKBzhEjDEHtR40aJSNHjpT169fLzZs3na4HbuCHIPgDBw6UadOmyY4dO5zGF7t7965isXnzZmNNMADHb7/9VqZOnSo4E/gbA94V8C64Y76rCtbSCWvo9itXrqh3/PHHH6oJ85YtWyb9+/cX7PHEiROqXT/Add++fTJr1izp2bOnTJw4UfA78vr1az2EOQmQAAmQAAmEDwI8pU8RoGDmU5+T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)READMEArchitectureMaster_BOMNode_ArchetypesPer_Node_KitsCablingPower_BudgetSoftwareCommissioningSources

Core budget result:

* **Core prototype subtotal:** **$1,257**
* **15% contingency:** **$188.55**
* **All-in estimate:** **$1,445.55**
* **All-in per object:** **$180.69**
* **If you already have/reuse the central mini PC:** **$1,132 core**

The sheet is structured as a real build workbook, not just a parts list. It includes:

1. `README` — budget summary and assumptions
2. `Architecture` — RS485/M12/24V system plan
3. `Master_BOM` — full line-item budget with formulas and source URLs
4. `Node_Archetypes` — the 8 actual object species
5. `Per_Node_Kits` — estimated cost per object
6. `Cabling` — one-cable-per-object M12 trunk/drop schedule
7. `Power_Budget` — peak/average power estimates and fuse notes
8. `Software` — Ubuntu/Python/firmware/dashboard stack
9. `Commissioning` — install/test checklist
10. `Sources` — source URLs and rationale notes

The baseline is now: **central Ubuntu room brain → USB-RS485 adapter → linear M12 4-pin trunk → 8 removable object nodes**. Each object gets one M12 drop carrying **24V, ground, RS485 A, RS485 B**, then generates 5V locally. RS485 is appropriate here because it is a balanced multipoint serial standard, and M12 is a keyed industrial connector family commonly used in automation/transportation contexts. [Wikipedia+1](https://en.wikipedia.org/wiki/RS-485?utm_source=chatgpt.com)

I also kept the BOM honest: the $1k target is probably too tight once you commit to **8 objects + RS485 from day one + M12 cabling + proximity + self-sensing on every object**. The lean working version is closer to **$1.25k before contingency**, and the real no-panic purchase is closer to **$1.45k**.

[Version=v1.4 | Tag=<o_10> | Sources=web | Assumptions=6 | Cycle=10/3 | Locus=rs485-bom-workbook]

* * *

**You:**

!<g>
This any good?

Professionally refurbished with a fresh, activated install of Windows 11 Pro 64-bit (25H2, latest version).
This PC is fully tested and boots up fast thanks to the SSD Drive.
As a refurbished, pre-owned unit, it may show light cosmetic wear, such as light scratches or scuff marks.

This nice Mini PC measures only 6.9 x 1.3 x 7.0 inches!
Fast Dual-Band, USB Wireless (Wi-Fi) Adapter Included!

Dell Optiplex 3060
Intel Core i3-8100T 3.10GHz CPU
128GB NVMe SSD
16GB RAM DDR4
Video Outputs: DisplayPort, HDMI
No Built-in DVD Drive
Gigabit Ethernet, Audio Jack, & Dual Monitor Capable, USB 3.0

It will be packed carefully.

* * *

**ChatGPT:**

<g>

I’ll sanity-check this against the actual needs of the actuator/object-society setup: Ubuntu headless, Python room brain, RS485 adapter, dashboard, central mic/semantic layer, and reliable USB.

* * *

**ChatGPT:**

<g>

Yes — **this is good for the room-brain machine**, assuming the price is right. For our RS485 object-society build, this is much better than the old Celeron NUC tier.

The **Dell OptiPlex 3060 Micro / i3-8100T / 16GB RAM / 128GB NVMe** is strong enough for:

* Ubuntu Server LTS headless
* Python room-brain process
* RS485 serial control
* dashboard / local web UI
* central mic analysis
* logging
* watchdog/reset scripts
* light semantic-tone classification, especially if using an API or lightweight local model

The i3-8100T is an 8th-gen Coffee Lake desktop-class CPU, not a tiny Atom/Celeron chip. That matters. The comparable Coffee Lake “T” chips are low-power 35W parts, and the i3 tier is still real x86 desktop silicon, not toy hardware. [Wikipedia](https://en.wikipedia.org/wiki/Coffee_Lake?utm_source=chatgpt.com)

### The limits

The only real weakness is **local AI/audio heaviness**.

It is fine for:

> “room is loud / quiet / speech-like / clustered / tense / calm / semantic tone via API or lightweight classifier”

It is not ideal for:

> real-time local Whisper transcription + local LLM + audio feature extraction + dashboard + control loop all at once

For that, I’d rather have an **i5-8500T / i5-9500T / i5-10500T** mini PC. But for a first working prototype, this is absolutely usable.

### Buy/pass threshold

I’d buy this if it’s around:

* **great:** $70–100
* **fair:** $100–130
* **meh but acceptable:** $130–150
* **pass:** above $160 unless it includes power adapter, warranty, and a larger SSD

At $160+, you can often start hunting for an i5 OptiPlex 5060/7060/3070/5070 Micro instead.

### Things to verify before buying

Make sure it includes:

* Dell power adapter
* no BIOS/admin password
* working NVMe SSD
* at least 4–5 usable USB ports
* Ethernet working
* BIOS can boot Linux / Ubuntu from USB
* TPM/Secure Boot not locked in some weird refurb state

The Windows 11 install is not a big value for us because I’d wipe it and install Ubuntu Server LTS. But it is still a good sign that the machine is not ancient/unsupported; OptiPlex 3060/3070-class H370 systems are among the models noted as able to support Windows 11-era requirements. [Wikipedia](https://en.wikipedia.org/wiki/Dell_OptiPlex?utm_source=chatgpt.com)

### My read

For **THE TUB / TMAYD-style practical installation brain**, yes: this is a sensible buy.

For **this actuator object-society prototype**, yes: use it as the central hub, pair it with a good USB-RS485 adapter, powered USB hub only if needed, central USB mic, and a wired dashboard.

I would only hold out if you can get an **i5-8500T / 16GB / 256GB SSD** OptiPlex Micro for within $30–50 more.

[Version=v1.4 | Tag=<g_11> | Sources=web | Assumptions=3 | Cycle=11/3 | Locus=room-brain-pc]

* * *

**You:**

!<c>

Which of these is the best then



* * *

**ChatGPT:**

<c>

**Best: the Dell OptiPlex 3070 Micro i5-9500T, 8GB RAM, 256GB NVMe for $159.99.**

That’s the one I’d buy from this list.

Why:

* **i5-9500T is the strongest CPU shown**
* **3070 is newer than 7040**
* **256GB NVMe is enough for Ubuntu Server, logs, dashboard, Python envs**
* **Dell OptiPlex Micro is a very known, serviceable platform**
* **free returns matters**
* power adapter appears included
* good fit for room-brain duties: RS485 control, central mic analysis, dashboard, watchdog scripts

The **HP ProDesk 400 G5 i5-9500T** is basically the runner-up. Same general CPU class, also usable. I’d still choose the Dell 3070 unless the HP is meaningfully cheaper or has better ports.

I’d skip the **Dell 7040 i5-6500T** and **Lenovo M900 i5-6500T** at those prices. They are 6th-gen machines, and $140–170 is too close to the newer i5-9500T listings. For our purposes, the 9500T gives more headroom for semantic/audio processing and is just a better long-term install brain.

The only caveat: **8GB RAM is workable but not ideal**. For basic Ubuntu Server + Python room brain, it’s fine. Later, upgrading to **16GB** would be nice, especially if you run local semantic models instead of API-based classification.

My ranking:

1. **Dell OptiPlex 3070 Micro i5-9500T / 8GB / 256GB NVMe — buy**
2. HP ProDesk 400 G5 Micro i5-9500T / 8GB / 256GB NVMe — good backup
3. Dell OptiPlex 7040 i5-6500T — only if under ~$90
4. Lenovo ThinkCentre M900 i5-6500T — too expensive here

[Version=v1.4 | Tag=<c_12> | Sources=none | Assumptions=3 | Cycle=12/3 | Locus=room-brain-pc-choice]

* * *

**You:**

!<c>
But that ram upgrade is just a 8gb stick I’d have to buy right

* * *

**ChatGPT:**

<c>

Yes — **probably just one 8GB DDR4 SODIMM stick**, _if_ that Dell 3070 Micro ships with **1×8GB** and has the second RAM slot empty.

The 3070 Micro uses **DDR4 SODIMM laptop-style RAM**, with **2 SODIMM slots**, and the 3070 Micro line is listed at **DDR4-2666 / 32GB max**. [Wikipedia](https://en.wikipedia.org/wiki/Dell_OptiPlex?utm_source=chatgpt.com)

So the easy upgrade path is:

> buy the machine → open it → confirm existing RAM layout → add **1×8GB DDR4-2666 SODIMM** if one slot is empty.

The only catch: some refurb sellers ship **2×4GB** instead of **1×8GB**. If it’s 2×4GB, then to reach 16GB you’d need either:

* replace both with **2×8GB**, or
* live with 8GB for now, which is honestly fine for the prototype.

I’d message the seller:

> Is the 8GB RAM configuration 1×8GB with one open SODIMM slot, or 2×4GB?

If it’s **1×8GB**, perfect. A matching 8GB stick is usually cheap, like **$10–20 used** or **$15–25 new**.

[Version=v1.4 | Tag=<c_13> | Sources=web | Assumptions=2 | Cycle=13/3 | Locus=room-brain-ram]

* * *

**You:**

!<c> 
and from this list?

* * *

**ChatGPT:**

<c>

From this OCDepot list, I’d split it like this:

**Best value for this project:**  
**HP ProDesk 600 G2 SFF i5-6500 / 16GB / 240GB SSD — $94.99**

That is the smartest budget buy. It is not tiny, but it is cheap, already has **16GB RAM**, and is plenty for Ubuntu Server, RS485 control, dashboard, central mic analysis, logging, and watchdog scripts. For a prototype where the whole BOM is already creeping over $1k, this is the rational pick.

**Best stronger-but-still-sensible pick:**  
**Dell OptiPlex 3070 SFF i5-9500 / 16GB / 512GB NVMe + 500GB SSD — $269.99**

This is the best “I want more headroom and don’t mind spending more” option. It is newer, faster, already has 16GB RAM, and has tons of storage. But it is not micro, and $270 is a big chunk of the project budget.

**Best compact/micro option on this page:**  
**HP ProDesk 405 G4 Mini Ryzen 5 Pro 2400GE / 8GB / 180GB SSD — $139.99**

This is probably the best compact one from the webpage. Not as strong as the i5-9500T Dell 3070 Micro you showed before, but it is cheap, small, and workable. RAM upgrade would be nice eventually.

**Avoid for our use:**  
The $499–$699 machines are overkill. The i7-9700T Dell 7070 Micro at $359.99 is nice but too expensive for what this installation needs. The older Lenovo M93P Tiny / i5-4570T at $134.99 is not worth it next to the HP 405 G4 Mini or the cheaper SFF units.

My ranking from this page:

1. **HP ProDesk 600 G2 SFF i5-6500 / 16GB / 240GB — $94.99** — buy if SFF size is okay
2. **HP ProDesk 405 G4 Mini Ryzen 5 Pro / 8GB / 180GB — $139.99** — buy if you need micro size
3. **Dell OptiPlex 3070 SFF i5-9500 / 16GB / 512GB+500GB — $269.99** — best headroom, worse value
4. **Dell Vostro 3470 SFF i3-9100 / 16GB / 1TB — $189.99** — decent but awkward value
5. **HP EliteDesk 800 G2 SFF i5-6500 / 16GB / 512GB — $99.99** — also very good if you prefer the larger SSD over the ProDesk 600

For _this_ project, I’d probably grab the **HP ProDesk 600 G2 SFF at $94.99** and put the saved money into actuators, connectors, sensors, and spares.

[Version=v1.4 | Tag=<c_14> | Sources=web | Assumptions=3 | Cycle=14/3 | Locus=ocdepot-pc-choice]

* * *

**You:**

!<c> 
if i wanted to test 1 object soon, what should i buy?

* * *

**ChatGPT:**

<c>

For a **1-object test soon**, do **not** buy the full 8-object BOM yet. Buy one complete **RS485 object-node slice** that proves the whole architecture:

> room brain → USB-RS485 → 24V/M12 cable → object node → proximity + self-sensing → actuator behavior through object body

I’d prototype **BOWL-01 or CAN-01** first: a metal bowl, tray, or tin can. It is cheap, robust, gallery-audible, and it will immediately tell you whether the whole premise works.

## Buy this first

### Central / bench side

| Item | Qty | Est. |
| --- | --- | --- |
| Mini PC or use laptop temporarily | 1 | $0–160 |
| Isolated USB-to-RS485 adapter | 1 | $15–25 |
| USB room mic | 1 | $25–40 |
| 24V DC PSU, 3–5A is fine for one object | 1 | $20–35 |
| Small project box / service case | 1 | $10–20 |
| 120Ω RS485 terminator / resistor pack | 1 | $5 |

For the PC, you can test with your laptop first, but if buying now: the **HP ProDesk 600 G2 SFF at $94.99** is the budget move; the Dell 3070 Micro/i5-9500T is the nicer compact move.

### One object node

| Item | Qty | Est. |
| --- | --- | --- |
| Raspberry Pi Pico H / Pico 2 H, pre-soldered headers | 1 | $6–9 |
| Pico screw-terminal expansion board | 1 | $8–12 |
| 3.3V RS485 transceiver module, MAX3485/SP3485 type | 1 | $3–6 |
| 24V→5V buck converter, screw-terminal | 1 | $4–8 |
| MOSFET trigger/driver module | 1 | $3–6 |
| VL53L0X / VL53L1X ToF proximity sensor | 1 | $6–12 |
| Prewired piezo disc / contact mic disc | 1 | $2–5 |
| Piezo protection parts: 1M resistor + clamp/zener kit | 1 | $5–10 |
| Small electronics sled/project box | 1 | $5–10 |
| Standoffs, grommet, cable clamp, strain relief | 1 set | $5–10 |

### One object cable path

| Item | Qty | Est. |
| --- | --- | --- |
| M12 A-coded 4-pin cable, 1–2m | 1 | $7–12 |
| M12 4-pin panel-mount pigtail for object | 1 | $5–8 |
| M12 4-pin pigtail/breakout for central side | 1 | $5–8 |
| Cable labels | 1 small pack | $5–10 |

This is the important part: even for the first test, use the **same one-cable-per-object logic** as the final piece. Don’t test with loose dupont jumpers and then discover later that the real cable architecture behaves differently.

### First actuators

For the first object, buy **two actuator types**:

| Item | Qty | Est. |
| --- | --- | --- |
| 12V push-pull solenoid for tapping | 1–2 | $7–15 |
| ERM vibration motor, prewired if possible | 1–2 | $2–8 |
| Springs/felt/rubber/foam/small striker material | 1 set | $10–20 |

That gives you **knock/tap** and **tremble/hum-ish behavior** through the object body. Don’t start with servo scraping or rotating yet. Those are second-object behaviors.

### Tools / fabrication

| Item | Qty | Est. |
| --- | --- | --- |
| Ferrule crimper + ferrule kit | 1 | $20–30 |
| Small screwdriver set | 1 | $5–10 |
| 3M Dual Lock / VHB / foam tape / cable clips | 1 set | $15–25 |

Ferrules are the compromise: **no soldering, no wire nuts, no WAGOs**, but clean screw-terminal connections.

## Expected cost

Excluding the mini PC:

**Lean 1-object test:** about **$160–250**

Including a cheap room-brain PC:

**Full 1-object working system:** about **$260–410**

That is the right first spend. It proves the bus, power, object behavior, sensing, dashboard, and reset logic without committing to eight nodes.

## What I would physically build first

Build this as **BOWL-01 / CAN-01**:

* metal bowl, tin can, small metal tray, or resonant food tin
* solenoid mounted inside to tap the body
* ERM motor mounted to the body for trembling
* piezo/contact sensor attached to the surface
* ToF sensor hidden near the rim/base for approach detection
* M12 panel connector exiting cleanly from the underside/back
* Pico node inside on a removable sled

Behavior test:

1. object makes small social taps when room is empty
2. proximity rises → object conceals
3. central mic detects speech → risk state rises
4. object goes quiet or trembles below obvious attention
5. after absence/silence → object resumes
6. contact mic confirms whether its own tap actually happened
7. room brain logs state, not audio

That is the smallest complete version of the piece.

## Do not buy yet

Hold off on:

* all 8 M12 T-splitters
* all 8 object drop cables
* stepper motors
* servo scraping mechanisms
* surface exciters/amplifiers
* central fused distribution box
* full cable ramps
* all spare parts

Buy one complete slice first. Once that slice works, the 8-object BOM becomes repetition, not invention.

[Version=v1.4 | Tag=<c_15> | Sources=none | Assumptions=5 | Cycle=15/3 | Locus=one-object-rs485-test]

* * *

**You:**

!<c> 
source these for me from my bom

* * *

**ChatGPT:**

<c>

Yes. From your BOM, I’d source **one complete CAN/BOWL test node**, not the whole population yet. Buy enough to test the real architecture: **Ubuntu/laptop → USB-RS485 → 24V/M12 object cable → local Pico node → proximity + piezo + actuator.**

## Buy now: one-object source list

| BOM ID | Buy | Qty | Source direction | Notes |
| --- | --- | --- | --- | --- |
| C-002 | USB-to-RS485 adapter | 1 | **Waveshare USB TO RS485** | Good first adapter: screw-terminal A/B/GND, Linux-compatible, up to 32 RS485 nodes listed. [Waveshare](https://www.waveshare.com/usb-to-rs485.htm) |
| C-003 | USB room mic | 1 | Any Linux-friendly USB condenser/boundary mic | Needed if you want semantic/prosody behavior in the first test. |
| C-004 | 24V PSU | 1 | Use one you own first | No need to buy if you already have a clean 24V supply. |
| N-001 | Pico H / Pico 2 H | 1–2 | Raspberry Pi Pico with pre-soldered headers | Pico supports UART/I2C/ADC/GPIO and drag-and-drop USB programming; pre-soldered headers are available in the Pico family. [Raspberry Pi](https://www.raspberrypi.com/products/raspberry-pi-pico/) |
| N-002 | Pico screw-terminal expansion board | 1 | Amazon / maker supplier | This is what keeps it no-solder/no-breadboard. Search exact phrase: `Raspberry Pi Pico screw terminal expansion board`. |
| N-003 | 3.3V RS485 transceiver | 1–2 | MAX3485/SP3485 module | Must be **3.3V-compatible** for Pico. Buy a spare. |
| N-004 | 24V→5V buck converter | 1–2 | Screw-terminal buck converter | Search: `24V to 5V buck converter screw terminal`. |
| N-005 | MOSFET actuator driver | 1–2 | Trigger/MOSFET module | For solenoid/vibration motor switching. Search: `MOSFET trigger switch module Arduino`. |
| S-001 | ToF proximity sensor | 1 | Adafruit VL53L0X | Good local proximity sensor; Adafruit lists 30–1000mm and in stock at $14.95. [Adafruit+1](https://www.adafruit.com/product/3317) |
| S-002 | Piezo contact sensor | 1–2 | SparkFun Piezo Element SEN-10293 | Cheap self-listening sensor; SparkFun explicitly frames it for vibration/knock sensing. [SparkFun Electronics](https://www.sparkfun.com/products/10293) |
| S-003 | Piezo protection parts | 1 kit | resistor + zener/clamp assortment | Do not plug piezo straight into Pico ADC without protection. |
| CB-002 | M12 4-pin object cable | 1 | Amazon / industrial supplier | A-coded 4-pin, 1–2m. |
| CB-004 | M12 panel-mount pigtail | 1 | Amazon / industrial supplier | This becomes the object’s one-cable service connector. |
| CB-005 | 120Ω terminators | 2 | resistor pack or RS485 terminal block | For bench test, at least have resistors available. |
| A-001 | 12V solenoid tapper | 1 | Adafruit small push-pull solenoid | Good first actuator: 12V, mounting tabs, return spring, ~300mA draw. [Adafruit](https://www.adafruit.com/product/412) |
| A-002 | ERM vibration motor | 1–2 | DigiKey/Amazon equivalent | Adafruit’s listed one is useful as a reference, but it currently shows out of stock; buy an equivalent prewired 3–5V ERM motor. [Adafruit](https://www.adafruit.com/product/1201) |
| A-008 | mechanical tap kit | 1 | McMaster / hardware store | Felt, springs, rubber washers, foam, tiny mallet material. This matters more than it seems. |
| T-001 | ferrule crimper kit | 1 | Amazon | Since no WAGOs/wire nuts: ferrules + screw terminals are the clean path. |
| T-005 | mounting/cable dressing | 1 | 3M Dual Lock, VHB, cable clips | Keep the internal sled removable but stable. |

## I’d skip for the first test

Do **not** buy the 8× M12 T-splitters, 7× trunk jumpers, all 8 drops, all 8 Picos, surface exciters, amp modules, stepper, servo set, or full spares kit yet.

For one object, you only need to prove:

> one cable carries 24V + GND + RS485 A/B into a removable object.

Then inside the object:

> 24V becomes 5V, Pico reads proximity/piezo, Pico receives RS485 state, actuator taps/trembles, room brain logs behavior.

## Best first object

Make the first one **CAN-01 or BOWL-01**.

Use:

* metal can / bowl / tray
* solenoid tapper
* ERM motor
* piezo contact sensor
* ToF proximity
* M12 panel connector
* internal removable electronics sled

That will tell you immediately whether the piece has a body.

## Expected one-object cost

Without PC and without PSU: **about $120–180**.

With USB mic and a few spares: **about $180–240**.

With a used mini PC too: **about $280–380**, depending on which computer you buy.

This is the right first spend. It gives you a real RS485, one-cable, no-battery, no-solder-at-install slice of the final installation.

[Version=v1.4 | Tag=<c_16> | Sources=web | Assumptions=4 | Cycle=16/3 | Locus=one-object-sourcing]

* * *

**You:**

!<o> 
find me the best possible links for each of the below


* * *

**You:**

!<o> 
find me the best possible links for each of the below

<c>

Yes. From your BOM, I’d source **one complete CAN/BOWL test node**, not the whole population yet. Buy enough to test the real architecture: **Ubuntu/laptop → USB-RS485 → 24V/M12 object cable → local Pico node → proximity + piezo + actuator.**

## Buy now: one-object source list

| BOM ID |                                 Buy |   Qty | Source direction                              | Notes                                                                                                                                           |
| ------ | ----------------------------------: | ----: | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C-002  |                USB-to-RS485 adapter |     1 | **Waveshare USB TO RS485**                    | Good first adapter: screw-terminal A/B/GND, Linux-compatible, up to 32 RS485 nodes listed. ([Waveshare][1])                                     |
| C-003  |                        USB room mic |     1 | Any Linux-friendly USB condenser/boundary mic | Needed if you want semantic/prosody behavior in the first test.                                                                                 |
| C-004  |                             24V PSU |     1 | Use one you own first                         | No need to buy if you already have a clean 24V supply.                                                                                          |
| N-001  |                   Pico H / Pico 2 H |   1–2 | Raspberry Pi Pico with pre-soldered headers   | Pico supports UART/I2C/ADC/GPIO and drag-and-drop USB programming; pre-soldered headers are available in the Pico family. ([Raspberry Pi][2])   |
| N-002  | Pico screw-terminal expansion board |     1 | Amazon / maker supplier                       | This is what keeps it no-solder/no-breadboard. Search exact phrase: `Raspberry Pi Pico screw terminal expansion board`.                         |
| N-003  |              3.3V RS485 transceiver |   1–2 | MAX3485/SP3485 module                         | Must be **3.3V-compatible** for Pico. Buy a spare.                                                                                              |
| N-004  |               24V→5V buck converter |   1–2 | Screw-terminal buck converter                 | Search: `24V to 5V buck converter screw terminal`.                                                                                              |
| N-005  |              MOSFET actuator driver |   1–2 | Trigger/MOSFET module                         | For solenoid/vibration motor switching. Search: `MOSFET trigger switch module Arduino`.                                                         |
| S-001  |                ToF proximity sensor |     1 | Adafruit VL53L0X                              | Good local proximity sensor; Adafruit lists 30–1000mm and in stock at $14.95. ([Adafruit][3])                                                   |
| S-002  |                Piezo contact sensor |   1–2 | SparkFun Piezo Element SEN-10293              | Cheap self-listening sensor; SparkFun explicitly frames it for vibration/knock sensing. ([SparkFun Electronics][4])                             |
| S-003  |              Piezo protection parts | 1 kit | resistor + zener/clamp assortment             | Do not plug piezo straight into Pico ADC without protection.                                                                                    |
| CB-002 |              M12 4-pin object cable |     1 | Amazon / industrial supplier                  | A-coded 4-pin, 1–2m.                                                                                                                            |
| CB-004 |             M12 panel-mount pigtail |     1 | Amazon / industrial supplier                  | This becomes the object’s one-cable service connector.                                                                                          |
| CB-005 |                    120Ω terminators |     2 | resistor pack or RS485 terminal block         | For bench test, at least have resistors available.                                                                                              |
| A-001  |                 12V solenoid tapper |     1 | Adafruit small push-pull solenoid             | Good first actuator: 12V, mounting tabs, return spring, ~300mA draw. ([Adafruit][5])                                                            |
| A-002  |                 ERM vibration motor |   1–2 | DigiKey/Amazon equivalent                     | Adafruit’s listed one is useful as a reference, but it currently shows out of stock; buy an equivalent prewired 3–5V ERM motor. ([Adafruit][6]) |
| A-008  |                  mechanical tap kit |     1 | McMaster / hardware store                     | Felt, springs, rubber washers, foam, tiny mallet material. This matters more than it seems.                                                     |
| T-001  |                 ferrule crimper kit |     1 | Amazon                                        | Since no WAGOs/wire nuts: ferrules + screw terminals are the clean path.                                                                        |
| T-005  |             mounting/cable dressing |     1 | 3M Dual Lock, VHB, cable clips                | Keep the internal sled removable but stable.                                                                                                    |

## I’d skip for the first test

Do **not** buy the 8× M12 T-splitters, 7× trunk jumpers, all 8 drops, all 8 Picos, surface exciters, amp modules, stepper, servo set, or full spares kit yet.

For one object, you only need to prove:

> one cable carries 24V + GND + RS485 A/B into a removable object.

Then inside the object:

> 24V becomes 5V, Pico reads proximity/piezo, Pico receives RS485 state, actuator taps/trembles, room brain logs behavior.

## Best first object

Make the first one **CAN-01 or BOWL-01**.

Use:

* metal can / bowl / tray
* solenoid tapper
* ERM motor
* piezo contact sensor
* ToF proximity
* M12 panel connector
* internal removable electronics sled

That will tell you immediately whether the piece has a body.

## Expected one-object cost

Without PC and without PSU: **about $120–180**.

With USB mic and a few spares: **about $180–240**.

With a used mini PC too: **about $280–380**, depending on which computer you buy.

This is the right first spend. It gives you a real RS485, one-cable, no-battery, no-solder-at-install slice of the final installation.

[Version=v1.4 | Tag=<c_16> | Sources=web | Assumptions=4 | Cycle=16/3 | Locus=one-object-sourcing]

[1]: https://www.waveshare.com/usb-to-rs485.htm "Industrial USB to RS485 Converter, Original FT232RNL and SP485EEN"
[2]: https://www.raspberrypi.com/products/raspberry-pi-pico/ "Buy a Raspberry Pi Pico – Raspberry Pi"
[3]: https://www.adafruit.com/product/3317 "Adafruit VL53L0X Time of Flight Distance Sensor - ~30 to 1000mm : Adafruit Industries, Unique & fun DIY electronics and kits"
[4]: https://www.sparkfun.com/products/10293 "Piezo Element - SparkFun Electronics"
[5]: https://www.adafruit.com/product/412 "Small Push-Pull Solenoid - 12VDC : Adafruit Industries, Unique & fun DIY electronics and kits"
[6]: https://www.adafruit.com/product/1201 "Vibrating Mini Motor Disc : Adafruit Industries, Unique & fun DIY electronics and kits"

* * *

**You:**

!<o> 
find me the best possible links for each of the below

!<o> 
find me the best possible links for each of the below

<c>

Yes. From your BOM, I’d source **one complete CAN/BOWL test node**, not the whole population yet. Buy enough to test the real architecture: **Ubuntu/laptop → USB-RS485 → 24V/M12 object cable → local Pico node → proximity + piezo + actuator.**

## Buy now: one-object source list

| BOM ID |                                 Buy |   Qty | Source direction                              | Notes                                                                                                                                           |
| ------ | ----------------------------------: | ----: | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C-002  |                USB-to-RS485 adapter |     1 | **Waveshare USB TO RS485**                    | Good first adapter: screw-terminal A/B/GND, Linux-compatible, up to 32 RS485 nodes listed. ([Waveshare][1])                                     |
| C-003  |                        USB room mic |     1 | Any Linux-friendly USB condenser/boundary mic | Needed if you want semantic/prosody behavior in the first test.                                                                                 |
| C-004  |                             24V PSU |     1 | Use one you own first                         | No need to buy if you already have a clean 24V supply.                                                                                          |
| N-001  |                   Pico H / Pico 2 H |   1–2 | Raspberry Pi Pico with pre-soldered headers   | Pico supports UART/I2C/ADC/GPIO and drag-and-drop USB programming; pre-soldered headers are available in the Pico family. ([Raspberry Pi][2])   |
| N-002  | Pico screw-terminal expansion board |     1 | Amazon / maker supplier                       | This is what keeps it no-solder/no-breadboard. Search exact phrase: Raspberry Pi Pico screw terminal expansion board.                         |
| N-003  |              3.3V RS485 transceiver |   1–2 | MAX3485/SP3485 module                         | Must be **3.3V-compatible** for Pico. Buy a spare.                                                                                              |
| N-004  |               24V→5V buck converter |   1–2 | Screw-terminal buck converter                 | Search: 24V to 5V buck converter screw terminal.                                                                                              |
| N-005  |              MOSFET actuator driver |   1–2 | Trigger/MOSFET module                         | For solenoid/vibration motor switching. Search: MOSFET trigger switch module Arduino.                                                         |
| S-001  |                ToF proximity sensor |     1 | Adafruit VL53L0X                              | Good local proximity sensor; Adafruit lists 30–1000mm and in stock at $14.95. ([Adafruit][3])                                                   |
| S-002  |                Piezo contact sensor |   1–2 | SparkFun Piezo Element SEN-10293              | Cheap self-listening sensor; SparkFun explicitly frames it for vibration/knock sensing. ([SparkFun Electronics][4])                             |
| S-003  |              Piezo protection parts | 1 kit | resistor + zener/clamp assortment             | Do not plug piezo straight into Pico ADC without protection.                                                                                    |
| CB-002 |              M12 4-pin object cable |     1 | Amazon / industrial supplier                  | A-coded 4-pin, 1–2m.                                                                                                                            |
| CB-004 |             M12 panel-mount pigtail |     1 | Amazon / industrial supplier                  | This becomes the object’s one-cable service connector.                                                                                          |
| CB-005 |                    120Ω terminators |     2 | resistor pack or RS485 terminal block         | For bench test, at least have resistors available.                                                                                              |
| A-001  |                 12V solenoid tapper |     1 | Adafruit small push-pull solenoid             | Good first actuator: 12V, mounting tabs, return spring, ~300mA draw. ([Adafruit][5])                                                            |
| A-002  |                 ERM vibration motor |   1–2 | DigiKey/Amazon equivalent                     | Adafruit’s listed one is useful as a reference, but it currently shows out of stock; buy an equivalent prewired 3–5V ERM motor. ([Adafruit][6]) |
| A-008  |                  mechanical tap kit |     1 | McMaster / hardware store                     | Felt, springs, rubber washers, foam, tiny mallet material. This matters more than it seems.                                                     |
| T-001  |                 ferrule crimper kit |     1 | Amazon                                        | Since no WAGOs/wire nuts: ferrules + screw terminals are the clean path.                                                                        |
| T-005  |             mounting/cable dressing |     1 | 3M Dual Lock, VHB, cable clips                | Keep the internal sled removable but stable.                                                                                                    |

## I’d skip for the first test

Do **not** buy the 8× M12 T-splitters, 7× trunk jumpers, all 8 drops, all 8 Picos, surface exciters, amp modules, stepper, servo set, or full spares kit yet.

For one object, you only need to prove:

> one cable carries 24V + GND + RS485 A/B into a removable object.

Then inside the object:

> 24V becomes 5V, Pico reads proximity/piezo, Pico receives RS485 state, actuator taps/trembles, room brain logs behavior.

## Best first object

Make the first one **CAN-01 or BOWL-01**.

Use:

* metal can / bowl / tray
* solenoid tapper
* ERM motor
* piezo contact sensor
* ToF proximity
* M12 panel connector
* internal removable electronics sled

That will tell you immediately whether the piece has a body.

## Expected one-object cost

Without PC and without PSU: **about $120–180**.

With USB mic and a few spares: **about $180–240**.

With a used mini PC too: **about $280–380**, depending on which computer you buy.

This is the right first spend. It gives you a real RS485, one-cable, no-battery, no-solder-at-install slice of the final installation.

[Version=v1.4 | Tag=<c_16> | Sources=web | Assumptions=4 | Cycle=16/3 | Locus=one-object-sourcing]

[1]: https://www.waveshare.com/usb-to-rs485.htm "Industrial USB to RS485 Converter, Original FT232RNL and SP485EEN"
[2]: https://www.raspberrypi.com/products/raspberry-pi-pico/ "Buy a Raspberry Pi Pico – Raspberry Pi"
[3]: https://www.adafruit.com/product/3317 "Adafruit VL53L0X Time of Flight Distance Sensor - ~30 to 1000mm : Adafruit Industries, Unique & fun DIY electronics and kits"
[4]: https://www.sparkfun.com/products/10293 "Piezo Element - SparkFun Electronics"
[5]: https://www.adafruit.com/product/412 "Small Push-Pull Solenoid - 12VDC : Adafruit Industries, Unique & fun DIY electronics and kits"
[6]: https://www.adafruit.com/product/1201 "Vibrating Mini Motor Disc : Adafruit Industries, Unique & fun DIY electronics and kits"


* * *

**ChatGPT:**

<o>

Here’s the sourced one-object buy list. I’d treat this as **CAN/BOWL-01 v0.1**, not the full 8-object buy.

### Best primary sources

| BOM ID | Item | Buy this / source link | Qty | Notes |
| --- | --- | --- | --- | --- |
| C-002 | USB-to-RS485 adapter | **Waveshare USB TO RS485** [Waveshare](https://www.waveshare.com/usb-to-rs485.htm?utm_source=chatgpt.com) | 1 | Correct first adapter: screw terminal A/B/GND, Linux support, automatic direction control, and point-to-multipoint RS485 support. |
| C-003 | USB room mic | **Audio-Technica ATR4697-USB boundary mic** [Audio-Technica](https://www.audio-technica.com/en-us/atr4697-usb) | 1 | Best fit for room sensing: low-profile boundary mic, omnidirectional, USB-C with USB-A adapter. |
| C-004 | 24V PSU | **MEAN WELL GST60A24-P1J / 24V desktop PSU** — Mouser search / Digi-Key search | 1 | Buy only if your existing 24V PSU is not clean/reliable. Desktop brick is safer/easier than open-frame AC wiring. |
| N-001 | Pico H / Pico with headers | **Raspberry Pi Pico H official / reseller page** [Raspberry Pi](https://www.raspberrypi.com/products/raspberry-pi-pico/) or **Adafruit Pico H listing** [Adafruit](https://www.adafruit.com/product/5525) | 1–2 | Get **pre-soldered headers**. Buy 2 if cheap; it saves the prototype if one gets fried. |
| N-002 | Pico screw-terminal expansion | **Amazon search: Raspberry Pi Pico screw terminal expansion board** | 1 | Commodity part. Get one with labeled screw terminals and Pico socket/header compatibility. |
| N-003 | RS485 transceiver for Pico | **Waveshare Pico-2CH-RS485** [Waveshare](https://www.waveshare.com/pico-2ch-rs485.htm) | 1 | This may replace a loose MAX3485/SP3485 module. It is cleaner: Pico-compatible, SP3485, 3.3V, UART-to-RS485. |
| N-004 | 24V→5V buck converter | **Amazon search: 24V to 5V buck converter screw terminal** | 1–2 | For your no-solder workflow, prioritize **screw-terminal input/output** over tiny Pololu boards, even if Pololu is higher quality. |
| N-005 | MOSFET actuator driver | **Adafruit MOSFET Driver 5648 via Digi-Key** [DigiKey](https://www.digikey.com/en/products?mpart=5648&v=1528) | 1–2 | Adafruit’s page is out of stock, but Digi-Key carries it. It is explicitly for motors/solenoids/LEDs and includes driver/kickback protection logic. |
| S-001 | ToF proximity sensor | **Adafruit VL53L0X Time-of-Flight sensor** [Adafruit](https://www.adafruit.com/product/3317) | 1 | Good first proximity sensor. STEMMA QT/Qwiic means no solder for I2C if you buy the cable. |
| S-001a | STEMMA QT cable | **Adafruit STEMMA QT cable category** — [Adafruit STEMMA QT cables](https://www.adafruit.com/category/619) | 1–2 | Don’t forget this. The sensor page notes the QT cable is not included. |
| S-002 | Piezo contact sensor | **SparkFun Piezo Element SEN-10293** [SparkFun Electronics](https://www.sparkfun.com/products/10293) | 1–2 | Cheap and correct for self-listening; SparkFun describes it for vibration/knock sensing. |
| S-003 | Piezo protection parts | **Amazon search: 1M resistor kit + 3.3V zener diode kit** | 1 kit | Use a 1M bleed resistor and clamp/protection before the Pico ADC. Do not raw-dog the piezo into the ADC. |
| CB-002 | M12 4-pin object cable | **Amazon search: M12 4 pin A-coded male female cable 2m** | 1 | For first test, buy one straight-through 4-pin A-coded cable. |
| CB-004 | M12 panel-mount pigtail | **Amazon search: M12 4 pin A-coded panel mount pigtail** | 1 | This becomes the object’s one clean service connector. |
| CB-005 | 120Ω terminators | **Amazon search: 120 ohm resistor assortment** | 1 kit | For bench test, normal resistors into screw terminals are fine. Later we can buy proper M12/RS485 terminators. |
| A-001 | 12V solenoid tapper | **Adafruit Small Push-Pull Solenoid 12VDC** [Adafruit](https://www.adafruit.com/product/412) | 1 | Correct first tapper: mounting tabs, return spring, 12V, roughly 300mA draw. |
| A-002 | ERM vibration motor | **Pololu shaftless vibration motor** [Pololu](https://www.pololu.com/product/1637) or **Adafruit 1201 reference / Digi-Key distributor link** [Adafruit](https://www.adafruit.com/product/1201) | 1–2 | Pololu is in-stock-looking and better documented; Adafruit’s is a good reference but currently listed out of stock. |
| A-008 | Mechanical tap kit | **McMaster search: small springs, felt pads, rubber washers** | 1 set | This is not optional. The musical result depends on how the solenoid physically meets the object. |
| T-001 | Ferrule crimper kit | **Amazon search: ferrule crimper kit 0.25-10mm²** | 1 | This is your no-solder/no-WAGO path for clean screw-terminal wiring. |
| T-005 | Mounting / cable dressing | **3M Dual Lock / VHB / adhesive cable mounts** — Amazon search | 1 set | Use Dual Lock for removable electronics sleds; VHB for semi-permanent strain relief/mounting. |

### Best checkout strategy

Buy the **verified electronics** from Waveshare, Adafruit, SparkFun, Pololu, and Digi-Key. Buy the **commodity infrastructure** from Amazon: M12 pigtails, ferrules, buck converter, cable labels, resistor/zener assortments, and mounting hardware.

I would buy in this order:

1. Waveshare USB-to-RS485
2. Pico H or Pico WH with headers
3. Waveshare Pico-2CH-RS485
4. Adafruit VL53L0X + STEMMA QT cable
5. SparkFun piezo
6. Adafruit/Digi-Key MOSFET driver
7. Adafruit solenoid
8. ERM vibration motor
9. M12 cable + panel pigtail
10. ferrules, buck converter, protection parts, mounting hardware

The only substitution I’d strongly consider is **using the Waveshare Pico-2CH-RS485 instead of a generic MAX3485 breadboard module**, because it keeps the first build cleaner and closer to the no-solder, no-breadboard goal.

[Version=v1.4 | Tag=<o_17> | Sources=web | Assumptions=4 | Cycle=17/3 | Locus=one-object-source-links]

* * *

**You:**

!<c> 
so mainly: pico and pico accessories, power (i have), mic (i have), mosfet driver, tof/pir (porbably both?) and accessories, piezo and accessories (i can make these with my hands tied behind my back. i don't need to buy these materials either), cabling (i still don't understand how that's going to work), electrical accessories (resistors), and motors (the good stuff). 

* * *

**ChatGPT:**

<c>

Yes — you’ve compressed it correctly. The **real buy categories** are:

1. **Pico + Pico accessories**
2. **node communication / RS485**
3. **sensors: ToF/PIR + self-sensing**
4. **MOSFET / actuator driving**
5. **cabling + connector logic**
6. **basic electrical protection**
7. **actuators / motors — the actual sculptural material**

The only part that still needs to click is the cabling. So here’s the clean model.

## The cable system

For each object, we want **one cable** carrying:

| Wire | Function |
| --- | --- |
| 24V+ | actuator / local power input |
| GND | shared power/data reference |
| RS485 A | data |
| RS485 B | data |

That is why a **4-pin M12 cable** makes sense.

The object has an **M12 panel connector** mounted to it. When you install the piece, you plug one M12 cable into the object. That’s it.

Inside the object:

> M12 panel connector → tiny terminal block / screw terminal → buck converter + RS485 module + Pico + actuator drivers

So the object is removable, but its electronics come with it.

## One-object bench version

For the first object, the cable path is:

```
Laptop / mini PC
  ↓ USB
USB-RS485 adapter
  ↓ RS485 A/B
central screw-terminal breakout
  + 24V PSU
  ↓
4-pin M12 cable
  ↓
M12 panel connector on object
  ↓
inside object:
  24V → buck converter → 5V Pico/sensors
  RS485 A/B → RS485 transceiver → Pico UART
  Pico GPIO → MOSFET driver → solenoid / motor
```

For one object, you do **not** need T-splitters yet. Just one point-to-point M12 cable to prove the architecture.

For eight objects later, it becomes:

```
central hub
  ↓
M12 trunk
  ↓
T-splitter → object 1
  ↓
T-splitter → object 2
  ↓
T-splitter → object 3
  ↓
...
  ↓
terminator at end of bus
```

The T-splitters stay with the floor/plinth/cable infrastructure. The objects plug in and unplug like modular sensor bodies.

## What to buy for cabling, specifically

For one object:

| Thing | Qty | What it does |
| --- | --- | --- |
| M12 A-coded 4-pin male-to-female cable, 1–2m | 1 | the object umbilical |
| M12 A-coded 4-pin panel-mount pigtail | 1 | mounted on object body/base |
| M12 pigtail or screw-terminal breakout for central side | 1 | lets PSU + RS485 adapter enter the M12 cable |
| 4-position screw terminal block inside object | 1 | clean internal distribution |
| ferrules + ferrule crimper | 1 kit | clean no-solder wire ends |
| cable labels | 1 pack | sanity |

The slightly annoying truth: M12 pigtails end in bare wires. But that’s okay. You are not soldering. You put ferrules on the wire ends and land them in screw terminals. That’s the clean no-WAGO/no-wire-nut path.

## Pico decision

I would buy:

* **Raspberry Pi Pico H or Pico 2 H**
* **Pico screw-terminal expansion board**
* **separate 3.3V RS485 module**

That is probably cleaner than stacking a specialized RS485 HAT and then fighting access to pins.

So:

```
Pico H → screw-terminal expansion board
        → RS485 module
        → ToF/PIR
        → piezo input
        → MOSFET driver(s)
```

The screw-terminal expansion board is what saves you from breadboard trash.

## ToF and PIR

Yes, probably both, but they do different things.

**ToF** is the main sculptural sensor. It says:

> someone/something is this close to me.

Use it for object-level concealment: person approaches object → object freezes, withdraws, trembles, or reduces activity.

**PIR** is cruder but useful as a wake/suspicion sensor. It says:

> warm body moved somewhere in this zone.

Use it for “something changed in the room” or “wake from idle.” PIR is bad at detecting still people. ToF is better for proximity, but it must be aimed.

So for the first object:

* ToF = required
* PIR = optional but useful
* central room mic = global social/speech state

## Piezo

Yes, you can absolutely make the piezo side yourself. The important thing is just the protection:

```
piezo disc
  ↓
1M bleed resistor across piezo
  ↓
series resistor / clamp protection
  ↓
Pico ADC
```

The piezo is not “just a mic” here. It is the object’s self-sensing channel:

> did I actually tap? how hard did the body answer? am I still ringing?

That’s what makes the loop cybernetic instead of just triggered.

## MOSFET driver

You need MOSFET driver modules for anything that draws more than a tiny GPIO-safe amount.

Use MOSFET drivers for:

* solenoid
* ERM vibration motor
* small DC motor
* possibly LED/haptic loads

Do **not** drive solenoids or motors directly from Pico pins.

The driver module should ideally have:

* screw terminals
* opto-isolation or at least logic-level input
* flyback/kickback protection, or you add a diode yourself
* rated current comfortably above your actuator

For the first test, get **2 MOSFET channels minimum**:

1. solenoid tapper
2. vibration/tremor motor

## Motors / actuators — the good stuff

For the first object, I would buy **three actuator types**, even if you only install two at first.

### 1. 12V push-pull solenoid

This is the first “real” sculptural actuator.

Use for:

* knock
* tap
* internal alarm
* failed concealment
* call signal

Mount it so it strikes the object body through felt/rubber/wood/spring, not bare metal by default. The mechanical interface is the instrument.

### 2. ERM vibration motor

Use for:

* tremble
* anxiety
* low body activity
* “almost-hidden” behavior
* aftershock after a tap

ERM motors are messy in a good way. They are not precise, but they feel physical.

### 3. Small servo or gearmotor

Use for:

* scrape
* shift
* rotate
* open/close a tiny damper
* drag a bead/washer/brush against the object

This is more mechanically involved, but it is the path toward the more interesting object behavior. Don’t make this the first thing you debug, but buy one so the test object can evolve.

I would **not** start with steppers yet. They are great later, but they add driver complexity and power/noise issues.

## Electrical accessories

You do not need a lot, but you do need a protection/bench kit:

| Item | Why |
| --- | --- |
| 120Ω resistors | RS485 termination |
| 1M resistors | piezo bleed |
| 1k / 10k resistors | signal conditioning / pullups / experiments |
| 3.3V or 5.1V zeners | piezo clamping |
| 1N400x diodes | flyback protection for coils |
| ferrules | clean screw-terminal wiring |
| screw terminal blocks | internal distribution |
| heat shrink | cable dressing |
| adhesive cable mounts | strain relief |
| small inline fuse holder or resettable fuse | branch safety |

The most important ones for first power-up are:

* 120Ω across RS485 A/B at the far end
* flyback diode across solenoid if the driver does not include one
* piezo protection before Pico ADC
* fuse or current-limited PSU while testing

## First-object shopping priority

I’d buy in this order:

1. Pico H / Pico 2 H
2. Pico screw-terminal expansion board
3. USB-RS485 adapter
4. 3.3V RS485 module
5. M12 cable + M12 panel pigtail + central breakout/pigtail
6. buck converter
7. MOSFET drivers
8. ToF sensor
9. PIR sensor
10. solenoid
11. ERM motor
12. one small servo/gearmotor
13. resistors/diodes/ferrules/labels/mounting hardware

That is the first real slice.

## The mental model

The first object is not a miniature version of the whole show. It is a **complete nervous system**:

```
presence sensing
+ room-risk input
+ self-sensing
+ actuator body
+ RS485 communication
+ local fallback behavior
+ one-cable installation
```

Once this one object works, the eight-object version becomes repetition and variation rather than a new invention.

[Version=v1.4 | Tag=<c_18> | Sources=none | Assumptions=5 | Cycle=18/3 | Locus=first-node-parts-logic]

* * *

**You:**

!<c> 
i have mic, psu, buck converter, piezo, ferrule kit, vhb; skip the mcmaster, we will have to go indepth on that together. 

otherwise, am i good to buy?

* * *

**ChatGPT:**

<c>

**Almost. I would not check out quite yet.** You’re 85–90% there, but there are **three small gotchas** that will make or break the no-solder/low-mess build.

## Good to buy as-is

These are good:

* **USB-to-RS485 adapter** — yes.
* **Waveshare Pico-2CH-RS485** — yes. This is a good cleaner choice than a loose MAX3485 board because it is Pico-specific, uses the SP3485 RS485 transceiver, and exposes RS485 over UART. It also has a Pico female header and male stacking header, so it is meant to sit in a Pico stack. [Waveshare](https://www.waveshare.com/pico-2ch-rs485.htm)
* **Pico WH with headers** — yes. You don’t need Wi-Fi, but the pre-soldered headers are the useful part.
* **VL53L0X ToF sensor** — yes. It is good for close object-level proximity; Adafruit says default range is roughly 30 mm to 1.2 m, with longer range possible on reflective targets. [Adafruit](https://www.adafruit.com/product/3317)
* **Solenoid** — yes, but see voltage note below.
* **ERM motor from DigiKey** — yes.
* **MOSFET driver from DigiKey** — yes. This is the right kind of part: Adafruit explicitly says motors/solenoids should not be driven directly from a GPIO pin, and this board includes a MOSFET plus flyback diode/protection logic. [Adafruit](https://www.adafruit.com/product/5648)
* **Resistor + zener kits** — yes, though optional if you already have enough values.

## Fix before buying

### 1. Cabling: you are missing the **central-side M12 breakout**

Right now you have:

```
object-side M12 panel connector
+
2m M12 male-to-female cable
```

That is only enough if the central side already has something to plug into. For a bench test, you need bare wires at the central side so you can land:

```
12V or 24V+
GND
RS485 A
RS485 B
```

So add **one M12 4-pin A-coded female pigtail / panel mount / field-wireable connector** for the central side.

Your object side can be male. The extension cable plugs into it. But the far end of the extension needs a **female pigtail/breakout** or you’ll have no clean way to inject power + RS485.

### 2. The Adafruit STEMMA/QT cable in your cart is probably the wrong cable

The VL53L0X sensor has STEMMA QT/Qwiic connectors, but the QT cable is not included. [Adafruit](https://www.adafruit.com/product/3317)

The cable in your Adafruit cart is:

> 4-pin JST PH to JST SH Cable — STEMMA to QT/Qwiic

That only helps if your Pico side has a **4-pin JST PH STEMMA socket**. Your Pico WH does not.

For this build, you probably want one of these instead:

* **JST SH 4-pin / STEMMA QT to bare wires**, best for screw terminals
* or **JST SH 4-pin / STEMMA QT to male headers**, best if landing on exposed Pico/Waveshare header pins

So: **replace or supplement that cable** unless you know exactly where the JST-PH side is going.

### 3. Add a cable for the MOSFET driver input

The Adafruit MOSFET driver uses a JST PH input connector for solderless signal/power, and output terminal blocks for the load. [Adafruit](https://www.adafruit.com/product/5648)

So add:

> **3-pin JST PH 2mm to bare-wire cable**  
> or  
> **3-pin JST PH 2mm to male-header cable**

Otherwise you’ll have the MOSFET board but no clean way to drive its input from the Pico without improvising.

## Voltage note: important

The Adafruit solenoid is **12VDC**, with roughly **300 mA** current draw. [Adafruit](https://www.adafruit.com/product/412)

So for this first object, either:

* run the M12 cable as a **12V bus** instead of 24V, then buck down to 5V for the Pico, or
* use a **24V→12V buck** for the solenoid, or
* buy a **24V solenoid** later for the final 24V trunk.

For the first test, I’d do the simplest thing:

> **12V bus over M12: 12V+, GND, RS485 A, RS485 B.**

That works with the solenoid and still proves the exact one-cable architecture. Later, the same M12 logic can become 24V.

## PIR?

Skip PIR for this checkout. You have enough to test the real system with:

* central mic = room/speech/social state
* ToF = local proximity
* piezo = self-sensing
* RS485 = object communication/control

PIR can be v0.2. It is useful, but it is not necessary for the first body.

## The one yellow flag

The **Whteeeen Pico screw-terminal expansion board** and the **Waveshare Pico-2CH-RS485** may be physically redundant or awkward together. The Waveshare board is designed to accept the Pico and has stacking headers, but I would not assume a random screw-terminal board will stack cleanly with it. [Waveshare](https://www.waveshare.com/pico-2ch-rs485.htm)

I’d still buy the screw-terminal board because it is cheap and may be useful, but don’t build the whole plan around those two stacking perfectly.

## My verdict

**Buy after adding:**

1. **M12 4-pin A-coded female pigtail / central breakout**
2. **STEMMA QT-to-bare-wire or QT-to-male-header cable for the VL53L0X**
3. **3-pin JST PH-to-bare-wire or PH-to-male-header cable for the MOSFET input**

Everything else is good for a first CAN/BOWL object test.

[Version=v1.4 | Tag=<c_19> | Sources=web | Assumptions=4 | Cycle=19/3 | Locus=one-object-cart-check]

* * *

**You:**

!<c> 
so like this?


also i have these already: PCS Dual High-Power MOSFET Trigger Switch Drive Module 0-20KHz PWM Adjustment Electronic Switch Control Board Motor Speed Controller Lamp Brightness Control, DC 5V-36V 400W, 15A (Max 30A)

* * *

**ChatGPT:**

<c>

Yes — **this is basically the right cart now**, but I’d make **two edits before buying**.

## Buy / keep

Keep these:

* **Waveshare USB-to-RS485 adapter** — yes.
* **Waveshare Pico-2CH-RS485** — yes.
* **Pico W with pre-soldered headers** — yes. Wi-Fi is irrelevant, but pre-soldered headers are the point.
* **M12 male panel pigtail**
* **M12 female panel pigtail**
* **M12 male-to-female 2m cable**
* **24V solenoid** — yes, actually better than the 12V one now that we’re thinking 24V bus.
* **JST-PH 3-pin cable pack** — useful for small module hookups.
* **resistor kit** — yes.
* **zener kit** — yes.
* **Pico screw-terminal breakout** — okay to buy, but don’t assume it will physically stack cleanly with the Waveshare RS485 board.
* **vibration motor modules** — okay for quick tremor tests.

Your existing **high-power MOSFET trigger switch modules** are probably fine for the solenoid, especially at 24V. The only thing to test is whether the Pico’s **3.3V GPIO** reliably triggers them. If yes, you can skip buying another MOSFET driver for now.

## Edit 1: the Amazon VL53L0X boards may require soldering

The ToF boards in your Amazon cart look like they come with **loose header pins**, not pre-soldered connectors.

That violates the no-solder goal.

I would either:

* buy the **Adafruit VL53L0X with STEMMA QT** instead, plus a QT-to-bare-wire or QT-to-header cable, or
* make sure the Amazon listing explicitly says **pre-soldered headers**.

For this project, the Adafruit board is the cleaner choice because it gives you a real plug connector.

## Edit 2: add a normal diode kit

The zener kit is useful for piezo/ADC protection, but for the solenoid you want a normal flyback diode unless your MOSFET module already includes coil suppression.

Add one cheap kit/search:

> **1N4007 diode assortment**  
> or  
> **1N5819 / Schottky diode assortment**

Put the diode across the solenoid coil if the driver board does not already include protection.

## The M12 cabling is now correct

You now have enough to do the one-cable architecture:

```
central side:
24V PSU + USB-RS485 adapter
        ↓
female M12 pigtail / breakout
        ↓
2m M12 male-to-female cable
        ↓
male M12 panel connector on object
        ↓
inside object:
24V → solenoid / buck converter
GND → shared ground
RS485 A/B → Waveshare Pico RS485 board
```

That’s the right physical model.

Use a multimeter to map the M12 wire colors before powering anything. Do not trust Amazon wire colors blindly.

## Voltage plan

For this cart, run the bus as:

```
Pin 1: +24V
Pin 2: RS485 A
Pin 3: GND
Pin 4: RS485 B
```

Inside the object:

```
24V → solenoid driver → solenoid
24V → buck converter → 5V
5V → Pico / ToF / vibration module as needed
```

The 5V vibration motor module must **not** see 24V.

## One caution on the 24V solenoid

The one in your cart says **24V 840mA**, which is about **20W** when energized. That is fine for short taps, but do not hold it on.

In firmware, start with pulses like:

```
20–80 ms ON
500–2000 ms minimum cooldown
```

Then tune mechanically with felt/rubber/springs instead of just increasing pulse time.

## My verdict

**Buy after swapping/confirming the ToF sensor and adding a diode kit.**

Do not worry about PIR yet. This first object already has enough perception:

* central mic = room/speech state
* ToF = local approach
* piezo = self-sensing
* RS485 = object bus
* solenoid + vibration = body behavior

That is a complete first nervous system.

[Version=v1.4 | Tag=<c_20> | Sources=none | Assumptions=5 | Cycle=20/3 | Locus=cart-check-rs485-node]

* * *

**You:**

!<c> 
2 questions: 
1. cart is getting a bit expensive, what do i not need exactly. if it's all necessary that's fine. 
2. what 24v solenoid should i get precisely then? amazon link

* * *

**ChatGPT:**

<c>

Yes — you can cut this down. For the **first one-object RS485 test**, you do **not** need the full $144 Amazon cart plus Adafruit/DigiKey extras.

## Cut these now

**Cut the JST-XH 4-pin kit** unless you already know a specific module uses JST-XH. For this test, it is not solving the main wiring problem. The M12 pigtails + screw terminals + ferrules handle the power/data cable.

**Cut the Amazon VL53L0X 2-pack** _if_ it requires soldering headers. For no-solder, the Adafruit VL53L0X + STEMMA QT cable is cleaner. If you are willing to solder headers later, keep it, but it violates the immediate premise.

**Cut the Adafruit/DigiKey MOSFET driver** because you already have the dual high-power MOSFET trigger modules. Test whether they trigger from **3.3V Pico GPIO**. If yes, you’re covered.

**Cut the resistor kit if you already have 1M, 10k, 1k, and 120Ω resistors.** Otherwise keep it; it is only $5 and useful.

**Cut the zener kit if you already have 3.3V/5.1V zeners or Schottkys for piezo protection.** Otherwise keep it.

**Cut the vibration motor modules if you already have any small ERM/vibe motors.** If not, keep them; they are cheap and useful for a tremor test.

**Cut the Pico screw-terminal breakout if you are okay landing wires directly on the Waveshare Pico-2CH-RS485 screw terminals/headers for the first test.** It is convenient, but not strictly necessary. It may not stack nicely with the Waveshare RS485 board anyway.

## Keep / buy these

For the minimum working test, keep:

| Item | Keep? | Why |
| --- | --- | --- |
| Waveshare USB-to-RS485 adapter | yes | central computer to bus |
| Waveshare Pico-2CH-RS485 | yes | object-side RS485/Pico interface |
| Pico W / Pico WH with headers | yes | object brain |
| M12 male panel pigtail | yes | object-side connector |
| M12 female pigtail | yes | central-side breakout |
| M12 male-to-female cable | yes | actual one-cable umbilical |
| 24V solenoid | yes | first real actuator |
| JST-PH 3-pin cable pack | yes | useful for MOSFET/small module signal hookups |
| diode kit / 1N4007 or 1N5819 | yes | flyback protection if your MOSFET board lacks it |
| vibration motor or module | optional but good | tremor layer |

## Cheapest viable cart

The truly necessary Amazon/Waveshare-ish version is basically:

1. Pico WH
2. Waveshare Pico-2CH-RS485
3. USB-to-RS485 adapter
4. M12 male pigtail
5. M12 female pigtail
6. M12 2m cable
7. 24V solenoid
8. diode kit
9. maybe JST-PH 3-pin cables
10. maybe vibration motor/module

Everything else is convenience or v0.2.

## 24V solenoid: get this type

The one in your cart is a reasonable first choice:

**Heschen DC Solenoid Electromagnet, Push Pull Type, HS-0530B, DC24V, 840mA, 10mm Stroke, Initial Force 0.5N, Max Keep Force 5N**

Use this Amazon search link to get that exact listing family:

Amazon search: Heschen HS-0530B DC24V 840mA 10mm stroke solenoid

Why this one: it is cheap, 24V native, has a spring return, enough travel to physically tune a tapper, and enough force to make a can/bowl speak.

Important warning: **840mA at 24V is about 20W**, so use short pulses only. Start with:

```
20–50 ms ON
500–2000 ms cooldown
never hold continuously
```

My final cut: **buy the solenoid you already found, keep the M12/RS485/Pico core, skip the extra connector kits and duplicate sensor/driver stuff.**

[Version=v1.4 | Tag=<c_21> | Sources=none | Assumptions=4 | Cycle=21/3 | Locus=cart-trim-solenoid]

* * *

**You:**

!<c> 
840mA at 24V is about 20W i want to avoid: brownout, blowing up my circuit, heat, fire, etc... and i want to be able to run the solenoid as it wishes (on, hang/latched, etc.) so give me something that will avoid that. direct amazon link

* * *

**ChatGPT:**

<c>

Yes — **do not buy the Heschen HS-0530B if you want to hold it on / latched.** That kind of open-frame push-pull solenoid is for **short pulses**, not hanging energized. It will get hot, draw a lot, and make your power/safety problem worse.

For what you’re describing, the safer move is:

> **Use a latching solenoid / electromagnet latch for “hold” behavior, and use short-pulse solenoids only for tapping.**

A latching solenoid changes state with a pulse, then mechanically/magnetically stays there without continuous current. That avoids the “20W heater inside an artwork” problem.

## Buy this kind instead

Search/buy this Amazon category:

Amazon: 24V latching solenoid push pull

More targeted:

Amazon: 24V bistable latching solenoid electromagnet

I would **not** buy the 24V 840mA Heschen as your main actuator. It is okay for short taps, but not for held states.

## What to look for in the listing

Buy only if the listing says some combination of:

* **latching**
* **bistable**
* **self-holding**
* **maintains position after power off**
* **pulse driven**
* **continuous duty** if it is not latching

Avoid listings that only say:

* push-pull solenoid
* open frame
* electromagnet
* 24V 840mA / 1A / 2A
* no duty-cycle information

Those are almost always short-duty actuator coils.

## Better architecture

For the first object:

* **latching solenoid** = sustained state / hang / held position
* **small ERM/vibration motor** = tremor / continuous low-energy behavior
* **short-duty solenoid later** = percussive tap only, never held

So the firmware rule becomes:

```
tap solenoid: 20–80 ms pulse only
latching solenoid: pulse to change state, then power off
vibration motor: allowed to run longer with PWM/current limits
```

That gets you the behavior you want without turning the object into a heating element.

[Version=v1.4 | Tag=<c_22> | Sources=none | Assumptions=3 | Cycle=22/3 | Locus=safer-solenoid-choice]

* * *

**You:**

!<c> 
i'd like to buy one solenoid if possible. would latching generally be less prone to overheating

* * *

**ChatGPT:**

<c>

Yes: **a true latching/bistable solenoid is generally much less prone to overheating** because it only uses power to change state, then holds mechanically or magnetically with **no continuous coil current**.

But the key word is **true**. A lot of Amazon results are misleading:

* “self-locking relay module” = not a solenoid, just a relay board
* “electric lifting magnet” = holds only while powered, can still heat
* “push-pull solenoid” = usually short-pulse only unless explicitly continuous-duty
* “latching” / “bistable” = good only if the listing says it holds position after power is removed

For **one first solenoid**, I would actually separate the jobs:

### Best first buy for tapping

Buy this only as a **pulse tapper**, not a hold/latch actuator:

**Fielect DC 24V 15N 10mm Push Pull Type Solenoid**  
https://www.amazon.com/dp/B07Z4JGV8B

Why this one over the Heschen: better visible rating on the current page, stronger force, cheap, 24V native, good for making a bowl/can speak. But it still needs firmware limits:

```
20–80 ms ON
500–2000 ms cooldown
never held continuously
```

### For held/latched behavior

Do **not** try to make the first solenoid “hang on.” For held states, use one of these instead:

* **small servo / gearmotor + mechanical latch**
* **latching solenoid explicitly marked bistable**
* **cabinet/electric lock mechanism that mechanically holds after a pulse**

The safe principle is:

> solenoid = strike/tap  
> servo/gearmotor/latch = sustained position  
> ERM motor = long tremble

That avoids brownout, heating, and “coil as toaster” problems.

### My recommendation

For this first object, buy **one Fielect 24V solenoid** as the tapper, and do **not** design it to hold. Your “held/latched” behavior should be v0.2 with a servo/gearmotor or true bistable mechanism.

So: **yes, buy one solenoid — this one — but treat it as percussive only.**  
https://www.amazon.com/dp/B07Z4JGV8B

[Version=v1.4 | Tag=<c_23> | Sources=web | Assumptions=4 | Cycle=23/3 | Locus=solenoid-duty-safety]

* * *

**You:**

!<c> 
no okay back to this. as long as it's just taps it will be fine? Heschen DC Solenoid Electromagnet, Push Pull Type, HS-0530B, DC24V 840mA, 10mm Stroke, Initial Force 0.5N, Max Keep Force 5N, 

we'd likely need guard rails so we never get too hot, but heat feedback was part of the whole central hub system no

* * *

**ChatGPT:**

<c>

Yes — **for taps, this Heschen solenoid is fine**. The product page is basically telling us the truth: it is **not for prolonged energizing**, but it is made for intermittent push/pull events. The key spec is:

> **ED%=5%**

That means the rated duty cycle is only about **5% on-time**. So it is a **tap / strike / impulse actuator**, not a “hold this position” actuator.

At **24V × 0.84A = ~20W**, it is powerful enough to heat up quickly if held, but if you run it as short pulses, it should be fine.

## Safe use rule

Use it like this:

```
20–60 ms ON
500–2000 ms OFF minimum
never held continuously
hard maximum: 100 ms ON
```

For initial tests, start conservative:

```
30 ms ON
1500 ms cooldown
max 10 taps/minute
```

Then tune the _mechanical striker_ — felt, spring, rubber, wood bead, washer, etc. — before increasing pulse length.

## Yes, heat feedback belongs in the cybernetic system

Absolutely. This actually fits the piece beautifully:

> each object has a “heat debt” or “actuator fatigue” state.

So the object can want to speak, but be physically constrained by its own body. That is exactly the right kind of cybernetic recursion.

But important distinction:

**The central hub can model heat/fatigue artistically. The local node must enforce heat/safety mechanically.**

Meaning:

* room brain says: “object may become more active”
* local Pico says: “no, solenoid is in cooldown”
* object responds with tremor, silence, or a smaller gesture instead

That is better conceptually and safer technically.

## Guard rails I’d implement

### 1. Rolling duty-cycle budget

Track recent solenoid on-time.

Example:

```
max 3 seconds ON per 60 seconds
```

That matches the 5% duty-cycle idea.

For extra safety, start lower:

```
max 1 second ON per 60 seconds
```

### 2. Absolute pulse cap

No command can energize the solenoid longer than:

```
100 ms
```

Even if the room brain glitches.

### 3. Cooldown timer

After every tap:

```
minimum 500–1500 ms cooldown
```

### 4. Thermal state variable

Even without a physical temperature sensor, track a software heat model:

```
heat += pulse_duration * intensity
heat -= cooling_rate * elapsed_time
```

If heat exceeds threshold:

```
disable solenoid
allow only vibration / silence / recovery behavior
```

### 5. Physical temperature sensor later

For v0.2, add a cheap **DS18B20** or **NTC thermistor** attached near the solenoid coil. Then the object can literally know its own heat.

That becomes part of the piece:

```
cold = freer speech
warm = inhibition
hot = enforced silence
```

### 6. Electrical safety

Use:

* MOSFET driver, not Pico GPIO directly
* flyback diode across solenoid if not already present
* common ground between Pico logic and solenoid power
* fuse or current-limited supply if possible
* do not power solenoid through the Pico or buck converter

## So: buy it?

Yes, **buy one** if it is for **percussive taps only**.

Do not use it for:

* hanging on
* holding a latch
* staying pulled
* long buzzing
* sustained pressure

For those behaviors, use a servo/gearmotor/latching mechanism later.

But for the first CAN/BOWL object, this is a good first actuator. It will give you a real knock, and its limitations — heat, duty cycle, fatigue — actually belong inside the work.

[Version=v1.4 | Tag=<c_24> | Sources=none | Assumptions=4 | Cycle=24/3 | Locus=solenoid-guardrails]

* * *

**You:**

!<c> 
is there a better one you can find on amazon that i can run for longer? 

* * *

**ChatGPT:**

<c>

Yes. From the Amazon options visible on your page, I’d switch away from the Heschen **840mA / ~20W** solenoid if you want longer, safer activity.

### Best safer Amazon pick

**Fielect DC 24V 42N 10mm Stroke Push Pull Solenoid Electromagnet, 0.45A, 10.8W, JF-1253B-24V**  
https://www.amazon.com/Fielect-Linear-Solenoid-Electromagnet-JF-1253B-24V/dp/B07Z3S1DDF

Why this is better:

* **0.45A instead of 0.84A**
* **10.8W instead of ~20W**
* much less heat load
* less brownout risk
* still 24V native
* stronger listed pull force than the tiny Heschen

It is still an open-frame solenoid, so I would **not treat it as continuous-duty unless the listing explicitly says continuous duty**, but it gives you much more thermal headroom for repeated taps.

### Even cooler / weaker option

**MECCANIXITY DC 24V 0.3A Solenoid Electromagnet Push Pull Type 5N 10mm Stroke JF-0730B**  
https://www.amazon.com/MECCANIXITY-Solenoid-Electromagnet-Actuator-JF-0730B/dp/B0DQCXJMR5

This is only **0.3A / ~7.2W**, so it should run cooler than both. But it may be less physically satisfying as a tapper.

### My recommendation

Buy **one Fielect JF-1253B-24V 0.45A / 10.8W**.

Then the local firmware guardrail can be less terrifying:

```
30–100 ms tap pulse
300–1000 ms cooldown
max rolling on-time: 3–5 seconds per minute
thermal/fatigue model always active
hard cutoff if repeated taps accumulate too quickly
```

Do not use any open-frame solenoid as a held actuator. But for a longer-running tapper, the **Fielect 0.45A / 10.8W** is the better buy than the Heschen 0.84A / ~20W.

[Version=v1.4 | Tag=<c_25> | Sources=web | Assumptions=3 | Cycle=25/3 | Locus=lower-power-solenoid]

* * *

**You:**

!<c> 
now i get what's going on in each object, but explain to me where the m12 is going again? 

* * *

**ChatGPT:**

<c>

The M12 is **not inside the logic of the object** so much as the **clean plug-and-play umbilical between the central system and the object**.

Think of it as the object’s single “gallery cable.”

## The whole chain

```
central hub / laptop / mini PC
  ↓ USB
USB-to-RS485 adapter
  ↓
central breakout point
  ↓
M12 cable
  ↓
M12 panel connector mounted on the object
  ↓
inside object electronics
```

So the M12 lives **between the room system and the object body**.

## What the M12 carries

The 4-pin M12 cable carries exactly four things:

```
+24V
GND
RS485 A
RS485 B
```

That means one cable gives the object both:

1. **power**
2. **network communication**

The object does not need USB going into it during normal installation. USB is only for programming/debugging the Pico.

## Physically, where each M12 part goes

### 1. M12 male panel connector

This gets mounted **on the object** or on a small electronics base attached to the object.

Example:

```
tin can / bowl / vase
  ↓
small hidden electronics sled/base
  ↓
M12 male panel connector mounted on side/bottom/back
```

This is the object’s plug.

### 2. M12 male-to-female cable

This is the removable cable from the object to the central side.

```
object M12 connector ←→ M12 extension cable ←→ central breakout
```

During install, you plug this in like a sensor cable.

### 3. M12 female pigtail / breakout

This is on the **central hub side** for the prototype.

Its bare wires land at your central screw-terminal area, where they connect to:

```
24V PSU +
24V PSU -
RS485 adapter A
RS485 adapter B
```

So the female pigtail is basically how the central system “injects” power and data into the M12 cable.

## Inside the object

Once the M12 cable enters the object through the panel connector, the four wires split like this:

```
M12 +24V
  → solenoid / motor power
  → buck converter input

M12 GND
  → shared ground
  → buck converter ground
  → MOSFET ground
  → Pico ground

M12 RS485 A/B
  → Waveshare Pico RS485 board
  → Pico UART
```

Then locally:

```
24V → buck converter → 5V
5V → Pico / ToF / vibration module
Pico GPIO → MOSFET module → solenoid tap
Pico ADC → piezo
Pico I2C → ToF
```

## The one-object prototype

For the first prototype, it looks like this:

```
Laptop
  ↓ USB
USB-to-RS485 adapter
  ↓ A/B wires
central screw terminals
  ↑ 24V PSU also lands here
  ↓
M12 female pigtail
  ↓
2m M12 male-to-female cable
  ↓
M12 male panel connector mounted on object
  ↓
object electronics
```

That’s why you bought both a **male panel connector** and a **female pigtail**. One lives on the object, one lives at the central/bench side.

## The 8-object version later

Later, the M12 system becomes a trunk:

```
central hub
  ↓
M12 trunk cable
  ↓
M12 T-splitter → object 1
  ↓
M12 T-splitter → object 2
  ↓
M12 T-splitter → object 3
  ↓
...
  ↓
terminator
```

But for one object, skip T-splitters. One cable is enough.

## Simple way to remember it

The Pico, solenoid, ToF, piezo, MOSFET, and buck converter are the **organs**.

The M12 is the **umbilical / nervous trunk**.

It is there so the object can be removed, carried, repaired, and reinstalled without rewiring anything.

[Version=v1.4 | Tag=<c_26> | Sources=none | Assumptions=3 | Cycle=26/3 | Locus=m12-architecture]

* * *

**You:**

!<c> 
can we snake this instead of running splitters?

* * *

**ChatGPT:**

<c>

Yes — **we can snake it**, and honestly that may fit the piece better than visible floor splitters.

Instead of:

```
central trunk
  → T-splitter → object 1
  → T-splitter → object 2
  → T-splitter → object 3
```

you do:

```
central hub
  ↓
object 1 IN → object 1 OUT
  ↓
object 2 IN → object 2 OUT
  ↓
object 3 IN → object 3 OUT
  ↓
end terminator
```

So each object becomes part of the chain.

## What changes physically

Each object needs **two M12 panel connectors**:

```
M12 IN
M12 OUT
```

Inside the object, the four bus lines pass through:

```
+24V  → passes through to OUT, also branches to object electronics
GND   → passes through to OUT, also branches to object electronics
RS485 A → passes through to OUT, also branches to Pico RS485
RS485 B → passes through to OUT, also branches to Pico RS485
```

So the object becomes a little “vertebra” in the snake.

## The object interior becomes

```
M12 IN
  ↓
small internal screw-terminal/pass-through block
  ├── to local object electronics
  └── M12 OUT
```

No wireless, no batteries, no splitter boxes on the floor.

## This is the better version aesthetically

For the gallery, a snaked line is much easier to make intentional:

```
central case → object → object → object → object
```

That reads as a nervous system / social chain / ecology. Splitters can start looking like tech clutter unless hidden under plinths or cable ramps.

## The tradeoff

The risk is: **if object 2 fails physically or gets unplugged, objects 3–8 lose the bus.**

That is the downside of snaking.

The mitigation is simple:

* each object has a passive pass-through path
* local electronics branch off the bus but do not interrupt it
* if one object fails electronically, the snake still passes through
* keep a short **M12 bypass cable** in the kit so you can remove one object and bridge the gap

## For the cart

Your cart already has:

* M12 male panel pigtails
* M12 female panel pigtails
* M12 male-to-female extension cable

That is basically the right family for snaking.

For **one object**, you only need:

```
central pigtail → M12 cable → object IN
```

For a snaked multi-object version, each object should have:

```
1× M12 male panel connector
1× M12 female panel connector
```

Then between objects:

```
M12 male-to-female extension cable
```

## Final answer

Yes: **snake it.** For the first object, build it with only one connector if you want speed. But if you want to prototype the _real_ exhibition architecture now, mount **both M12 IN and M12 OUT** on the object and make the bus pass through internally.

That gives you:

```
one clean object chain
one cable language
no floor splitters
no batteries
no wireless
no rewiring during install
```

The only hard rule: **RS485 terminator goes at the final object in the snake**, not at every object.

[Version=v1.4 | Tag=<c_27> | Sources=none | Assumptions=4 | Cycle=27/3 | Locus=m12-snake-topology]

* * *

**You:**

!<c> 
not daisy-chained, that's not what i mean. i mean central hub gets one cable with a serial or bus connector, and that one cable has 8 or so terminations to connect objects to

* * *

**ChatGPT:**

<c>

Yes — what you mean is **not daisy-chain**. It is a **trunk-and-drop snake** or **multi-drop harness**:

```
central hub
  ↓
one long cable / loom / snake
  ├── drop 1 → object 1
  ├── drop 2 → object 2
  ├── drop 3 → object 3
  ├── drop 4 → object 4
  ├── drop 5 → object 5
  ├── drop 6 → object 6
  ├── drop 7 → object 7
  └── drop 8 → object 8
```

That is probably the **best exhibition topology**.

## The important distinction

Physically, it looks like an octopus/snake.

Electrically, for RS485, it should still behave like a **main bus with short branches**, not a pure star.

So not this:

```
central hub
 ├── long cable to object 1
 ├── long cable to object 2
 ├── long cable to object 3
 └── long cable to object 4
```

That is a star, and RS485 can get weird there.

Better:

```
central hub
  ↓
main trunk / backbone
  ├─ short drop to object 1
  ├─ short drop to object 2
  ├─ short drop to object 3
  ├─ short drop to object 4
  └─ end terminator
```

So the **objects do not daisy-chain through each other**, but the cable harness itself is still a proper bus.

## What each object gets

Each object still has:

```
one M12 connector
```

The snake has eight female M12 drops, and each object has one male M12 panel connector.

```
snake drop female M12 → object male M12 panel connector
```

That means install is:

```
lay down snake
place objects
plug each object into its labeled drop
turn on hub
```

That is much better than crawling around with splitters.

## What the snake carries

Same four lines:

```
+24V
GND
RS485 A
RS485 B
```

Every drop receives all four.

Inside each object:

```
+24V → solenoid / buck converter
GND → shared ground
RS485 A/B → Pico RS485 board
```

## Where the terminator goes

For RS485, the 120Ω terminator goes at the **far end of the snake**, not at every object.

```
central hub → object drops along trunk → 120Ω terminator at physical end
```

Possibly another terminator at the central adapter end if the adapter does not already provide it. But **never one per object**.

## What to call/search for

The terms are:

```
M12 trunk drop cable
M12 multi drop cable
M12 sensor actuator distribution cable
M12 passive distribution box 8 port
M12 distribution harness
M12 actuator sensor box passive
```

But be careful: many “M12 distribution boxes” are made for industrial sensors where each port has separate signal lines. You need one where the pins are **parallel/common bus**, or you need to make the harness yourself inside a central box.

## Best practical version for us

For v0.1 / v0.2, I would not buy a fancy premade 8-port box yet. I’d make a **central breakout snake**:

```
central hub box
  ↓ one cable bundle / loom exits
  ├── labeled M12 female drop: CAN-01
  ├── labeled M12 female drop: VASE-01
  ├── labeled M12 female drop: BOWL-01
  ├── labeled M12 female drop: BOX-01
  └── etc.
```

Inside the central hub box, the four lines are distributed with screw terminals / barrier strips / ferrules:

```
24V+  → all drops
GND   → all drops
RS485 A → all drops
RS485 B → all drops
```

Then later, if the test works, you can replace that with a cleaner custom molded harness or industrial distribution block.

## Safety note

The only extra thing I’d want in the final version is **per-drop protection**:

```
24V+ → small fuse/polyfuse → object drop
```

So if one object shorts, it does not kill the whole snake or overheat the harness. For the one-object test, not urgent. For eight objects, yes.

## So the architecture becomes

```
Ubuntu hub / room brain
  ↓ USB
USB-RS485 adapter
  ↓
central power+data breakout
  ↓
one M12 trunk/drop snake
  ├── object 1
  ├── object 2
  ├── object 3
  ├── object 4
  ├── object 5
  ├── object 6
  ├── object 7
  └── object 8
```

That’s exactly the right direction: **one installation snake, eight object terminations, no daisy-chaining through sculptures, no visible splitter clutter.**

[Version=v1.4 | Tag=<c_28> | Sources=none | Assumptions=4 | Cycle=28/3 | Locus=m12-trunk-drop-snake]

* * *

**You:**

!<c>
okay, here is my cart. from the rs485 down to the ends of the cable terminations, let's make this change work. i want to work on the prototype with the completed snake. 

* * *

**ChatGPT:**

<c>

Yes — this change is doable, but it means your current cart is still thinking **one-object test cable**, not **completed 8-drop snake**.

What you want is a **single trunk/drop harness**:

```
central hub / snake head
  ↓
one bundled snake
  ├── M12 female drop 1 → object 1
  ├── M12 female drop 2 → object 2
  ├── M12 female drop 3 → object 3
  ├── M12 female drop 4 → object 4
  ├── M12 female drop 5 → object 5
  ├── M12 female drop 6 → object 6
  ├── M12 female drop 7 → object 7
  └── M12 female drop 8 → object 8
```

Each object still has **one M12 male panel connector**.

## The electrical structure

All eight drops share the same four lines:

```
M12 Pin 1 → +24V
M12 Pin 3 → GND / 0V
M12 Pin 2 → RS485 A
M12 Pin 4 → RS485 B
```

Do not trust wire colors blindly. M12 convention is often:

```
Pin 1 = brown
Pin 2 = white
Pin 3 = blue
Pin 4 = black
```

But verify every pigtail with a multimeter before powering anything.

## What changes from your cart

Right now you have enough M12 stuff for a **single object path**:

```
hub → M12 cable → one object
```

For the completed snake, you need enough M12 ends for **8 object drops**.

### Keep

Keep these:

* USB-to-RS485 adapter
* Waveshare Pico RS485 module
* Pico W / Pico WH
* Fielect 24V 0.45A solenoid
* diode kit, especially for flyback testing
* resistor kit, unless you already have all values
* M12 male panel connector pack
* M12 female pigtail pack
* JST-PH 3-pin pack
* vibration motor modules, if you want quick tremor tests

### Cut / optional

You can probably cut:

* **JST-XH 4-pin kit** — not needed for the snake
* **M12 2m male-to-female extension cable** — useful for the single-object bench test, but not necessary if you’re building the full fanout snake now
* **Pico screw-terminal breakout** — optional; the Waveshare Pico RS485 board plus ferrules/headers may be enough
* duplicate resistor/zener/diode kits if you already own those values

## What to add for the completed snake

For an 8-object snake, buy/build toward this:

| Part | Qty | Why |
| --- | --- | --- |
| M12 4-pin **female** pigtails | 8 total | These are the 8 snake drops that objects plug into |
| M12 4-pin **male** panel pigtails | 8 total eventually | One per object body |
| 4-conductor trunk/drop cable or bundled loom materials | 1 | Makes the physical snake |
| split loom / braided sleeving / Techflex | 1 roll | Turns 8 drops into one intentional cable object |
| cable labels / heat shrink labels | 1 pack | Drop labels: CAN-01, BOWL-01, etc. |
| small central headbox/enclosure | 1 | Where PSU + RS485 become the snake |
| barrier strips / screw terminal strips | 1–2 | No WAGO, no solder; all drops land here |
| per-drop fuse block or inline fuse holders | 8 ideally | One object short should not kill the whole system |
| cable glands / strain reliefs | several | So the snake cannot rip wires out of the headbox |

The completed snake starts in a **central headbox**, not directly out of the USB-RS485 dongle.

## The headbox layout

Inside the central hub/headbox:

```
24V PSU +
  → fuse/distribution
  → Drop 1 pin 1
  → Drop 2 pin 1
  → ...
  → Drop 8 pin 1

24V PSU -
  → shared GND bus
  → Drop 1 pin 3
  → Drop 2 pin 3
  → ...
  → Drop 8 pin 3

USB-RS485 A
  → RS485 A bus
  → Drop 1 pin 2
  → Drop 2 pin 2
  → ...
  → Drop 8 pin 2

USB-RS485 B
  → RS485 B bus
  → Drop 1 pin 4
  → Drop 2 pin 4
  → ...
  → Drop 8 pin 4
```

That is the whole snake.

## Important RS485 caveat

This is physically the clean thing you want, but electrically it is closer to a **star/fanout** than an ideal RS485 line.

For the prototype, that is okay if you run it conservatively:

```
baud rate: 9600 or 19200
drops: keep as short as practical
termination: do not put 120Ω on every object
protocol: polling, not everyone talking whenever they want
```

For the first prototype, I would start with **no termination**, then test. If the bus is noisy, add **one 120Ω resistor across A/B at the farthest physical drop**, not at all eight drops. Eight terminators would overload the bus.

The software should also assume this is a shared party line:

```
hub speaks → node responds only when addressed
node never talks unless polled
heartbeat every few seconds
timeouts cause local fallback behavior
```

## Best prototype build order

Do this:

1. Build the **central headbox** first.
2. Put the USB-RS485 adapter and 24V PSU input into that box.
3. Land +24V, GND, A, B onto terminal strips.
4. Add 2–3 M12 female drops first, not all 8.
5. Test one object.
6. Add the remaining drops once the bus works.
7. Sleeve/label the whole thing as the final snake.

Do not physically finish the entire beautiful snake before proving the bus. Build it electrically ugly, test, then dress it.

## My cart verdict

Do not change the object electronics plan. Change the **M12 plan**.

Your current M12 parts are good, but for the snake you need to decide:

### Minimal now

Keep only enough for one object, test first.

### Completed snake now

Add enough **female M12 pigtails for 8 drops**, enough **male M12 pigtails for objects**, plus headbox / terminal strip / strain relief / labels / sleeving.

The final image should be:

```
one central headbox
one bundled snake exiting it
8 labeled M12 female drop ends
8 objects with matching M12 male panel connectors
```

That is the right topology for the work.

[Version=v1.4 | Tag=<c_29> | Sources=none | Assumptions=5 | Cycle=29/3 | Locus=completed-rs485-snake]

* * *

**You:**

!<c> 
All eight drops share the same four lines: no, that's what i'm saying. one 32 or higher bit serial bus port. 8 connectors all wired into that, each object gets its own set of channels in that snake. that goes into our computer. 


objects -> snake in -> snake out -> pc

* * *

**ChatGPT:**

<c>

Yes — now I understand. You do **not** want an RS485 multidrop bus. You want a **multi-channel snake**:

```
objects
  ↓
8 object connectors on a snake
  ↓
one big multi-pin snake trunk
  ↓
interface/headbox
  ↓
computer
```

That is a different architecture, and it is actually cleaner for debugging.

The right name is not really “32-bit serial bus”; it is a **32-conductor / 8-channel point-to-point snake**.

## New architecture

Each object gets its **own private 4-wire channel**:

```
Object 1: +24V_1, GND_1, RS485_A_1, RS485_B_1
Object 2: +24V_2, GND_2, RS485_A_2, RS485_B_2
Object 3: +24V_3, GND_3, RS485_A_3, RS485_B_3
...
Object 8: +24V_8, GND_8, RS485_A_8, RS485_B_8
```

So the snake needs:

```
8 objects × 4 conductors = 32 conductors minimum
```

I would use a **37-pin or 50-pin trunk connector**, not just 32 pins, because you want room for shield/drain/spares.

## Physical version

```
CAN-01   → M12 drop 1 ┐
VASE-01  → M12 drop 2 │
BOWL-01  → M12 drop 3 │
BOX-01   → M12 drop 4 │
JAR-01   → M12 drop 5 ├── 32+ conductor snake ── DB37/DB50/multipin connector ── headbox ── USB ── PC
TRAY-01  → M12 drop 6 │
PLINTH-01→ M12 drop 7 │
QUIET-01 → M12 drop 8 ┘
```

Each object still gets a simple M12 connection. But **behind the snake**, those M12 connectors do **not** share the same four lines. Each one goes to its own private channel.

## The computer-side problem

Your current **USB-to-RS485 adapter only gives one RS485 channel**.

If you want eight independent object channels, you need one of these:

### Best version

```
PC → USB → 8-port USB-to-RS485 interface → snake headbox → 8 object channels
```

Search term:

```
8 port USB RS485 converter
8 channel USB to RS485
industrial USB RS485 8 port
```

This is the cleanest version.

### Hacky but acceptable prototype version

```
PC → powered USB hub → 8 separate USB-to-RS485 adapters → snake headbox → 8 object channels
```

This is more annoying physically, but very debuggable. Linux will see 8 serial ports.

### Not enough

```
PC → one USB-to-RS485 adapter → 8 private object channels
```

That does **not** work unless you return to the shared bus model.

## What changes in your cart

### Keep

Keep:

* Pico W / Pico WH
* Waveshare Pico-2CH-RS485 for the object
* solenoid
* vibration motor module
* diode kit
* resistor kit
* M12 male panel pigtails
* M12 female pigtails
* JST-PH kit
* VL53L0X sensors if you’re okay with the connector/soldering issue

### But the M12 quantities now matter

For a completed 8-drop snake, you need:

```
8× M12 female connectors on the snake side
8× M12 male panel connectors for the objects
```

If your cart has **4 packs of 2** male and **4 packs of 2** female, then yes: that gets you to 8 and 8.

### You do not need the M12 male-to-female extension cable as the main snake

That extension cable was for the earlier one-object cable model. For the completed snake, it is optional/bench-use only.

The real completed snake needs a **32+ conductor trunk**, not one 4-pin M12 cable.

## What to add

You need to add the snake/headbox infrastructure:

| Need | What to search |
| --- | --- |
| 32+ conductor trunk cable | `32 core control cable`, `36 conductor cable`, `37 conductor cable`, `multi conductor control cable` |
| multipin trunk connector | `DB37 breakout board screw terminal`, `DB50 breakout board screw terminal`, `37 pin D sub breakout` |
| PC-side interface | `8 port USB RS485 converter` |
| headbox enclosure | `plastic project enclosure cable glands` |
| per-channel terminal organization | `barrier strip 32 position`, `terminal block strip 32 position` |
| strain relief | `cable gland assortment` |
| channel labels | `heat shrink wire labels` |

## Cleaner pinout

Use a DB37 or DB50 trunk. Example DB37:

```
1  = OBJ1 +24V
2  = OBJ1 GND
3  = OBJ1 RS485 A
4  = OBJ1 RS485 B

5  = OBJ2 +24V
6  = OBJ2 GND
7  = OBJ2 RS485 A
8  = OBJ2 RS485 B

...

29 = OBJ8 +24V
30 = OBJ8 GND
31 = OBJ8 RS485 A
32 = OBJ8 RS485 B

33 = shield/drain
34 = spare
35 = spare
36 = spare
37 = spare
```

This is much easier to document and troubleshoot than a shared bus.

## Safety upgrade

This version is better because each object can be individually protected:

```
24V PSU
  → fuse 1 → object 1 +24V
  → fuse 2 → object 2 +24V
  → fuse 3 → object 3 +24V
  ...
  → fuse 8 → object 8 +24V
```

So one failed object does not take down the whole snake.

## Final corrected model

The thing you want is:

```
8 private object channels
inside one physical snake
ending in one multi-pin connector
feeding an 8-channel RS485 interface
connected to the PC over USB
```

That is the right way to make the prototype feel like a real installation system. The only major change is: **one USB-RS485 adapter is no longer enough**. You need either an **8-port RS485 interface** or **8 adapters hidden inside the headbox**.

[Version=v1.4 | Tag=<c_30> | Sources=none | Assumptions=5 | Cycle=30/3 | Locus=multichannel-snake-correction]

* * *

**You:**

!<c> 
okay now we're on the same page. i'm not going to build the snake this go around, but i don't want to grab redundant parts. should i just go back to the earlier kitting out (i believe it's just less pigtails) and then make the snake when expanding now that we know each rs485 will have its own object

* * *

**ChatGPT:**

<c>

Yes — **go back to the earlier one-object kit**, with fewer pigtails. Now that the architecture is clarified, the first prototype should prove **one complete channel**:

```
PC / laptop
  ↓ USB
single USB-RS485 adapter
  ↓
one RS485 channel + power
  ↓
M12 cable
  ↓
one object
```

Later, the snake becomes:

```
8 private RS485 channels
  ↓
one physical snake
  ↓
8 M12 object terminations
```

So for now, do **not** buy the completed-snake quantities.

## Reduce / remove now

In your cart, I would reduce:

| Item | Current idea | Change |
| --- | --- | --- |
| M12 male panel pigtail 2-pack | quantity 4 | reduce to **quantity 1** |
| M12 female pigtail 2-pack | quantity 4 | reduce to **quantity 1** |
| M12 2m male-to-female cable | quantity 1 | keep **1** |
| USB-to-RS485 adapter | quantity 1 | keep **1** |
| 8-port USB-RS485 converter | not in cart | **do not buy yet** |
| 32+ conductor snake cable / DB37 / DB50 | not in cart | **do not buy yet** |

The single USB-RS485 adapter is **not redundant**. It becomes your bench channel, your first object channel, or a spare/debug adapter later.

## What stays useful later

For the first object, buy enough to make:

```
bench/headbox side female M12 pigtail
  ↓
M12 extension cable
  ↓
object-side male M12 panel pigtail
```

That is forward-compatible because later the real snake will use:

```
snake female M12 drop → object male M12 panel connector
```

So your first object connector is already in the final language.

## My corrected “buy now” list

Keep/buy now:

* **1× USB-to-RS485 adapter**
* **1× Pico W / Pico WH**
* **1× Waveshare Pico RS485 board**
* **1× M12 male pigtail 2-pack**
* **1× M12 female pigtail 2-pack**
* **1× M12 male-to-female 2m cable**
* **1× Fielect 24V solenoid**
* **1× vibration motor module pack**
* **1× diode kit**
* **resistor/zener kits only if you don’t already have those values**
* **JST-PH 3-pin pack if useful for your motor/MOSFET module hookups**

Cut or postpone:

* extra M12 pigtail quantities
* 8-port USB-RS485 interface
* DB37/DB50 breakout
* 32+ conductor cable
* central snake enclosure
* completed snake sleeving/loom
* JST-XH kit unless a specific module requires it

## The rule

Build **one object as if it is object #1 of the future snake**, but do not buy the whole snake yet.

That gives you the correct prototype:

```
one private RS485 channel
one private power pair
one object connector
one actuator body
one local sensor stack
```

Then expansion is just multiplying that channel eight times inside a single physical snake.

[Version=v1.4 | Tag=<c_31> | Sources=none | Assumptions=4 | Cycle=31/3 | Locus=one-channel-first]

* * *

**You:**

!<c> 
do i need all the diodes and resistors? is there overlap in what i'm about to buy is what i'm saying

* * *

**ChatGPT:**

<c>

Yes, there is overlap. For this first buy, you do **not** need to buy every resistor/diode kit unless you’re trying to stock a bench.

## The three kits are not identical, but you can cut them

### 1. Regular diode kit — **probably keep**

This is the one with:

> 1N4001, 1N4007, 1N4148, 1N5819, etc.

Keep this **if you don’t already have rectifier diodes**.

You need it for:

```
solenoid flyback diode
motor flyback / transient protection
general “don’t let inductive loads spike my circuit” protection
```

For the solenoid, the useful parts are:

```
1N4007
1N5819
1N540x if you want beefier margin
```

So: **keep one normal diode assortment**.

### 2. Zener diode kit — **optional / probably cut**

This is mainly useful for:

```
piezo ADC clamping
signal protection
voltage limiting
```

But you already said you have piezo/protection materials and can handle that side. So unless you specifically lack **3.3V or 5.1V zeners**, you can cut the zener kit.

For this first actuator test, the zener kit is **not mission-critical**.

### 3. Resistor kit — **optional but cheap**

You only really need a few resistor values:

```
120Ω  → RS485 termination
1MΩ   → piezo bleed resistor
1kΩ   → signal protection / GPIO series resistor
10kΩ  → pullup/pulldown
```

If you already have those, cut the resistor kit.  
If you don’t, keep it. It’s $5 and will prevent annoying “I need one stupid resistor” delays.

## My exact recommendation

For your current cart:

| Item | Verdict |
| --- | --- |
| Regular diode assortment | **Keep** |
| Zener diode assortment | **Cut, unless you lack 3.3V/5.1V zeners** |
| Resistor assortment | **Keep only if you don’t already have 120Ω, 1MΩ, 1kΩ, 10kΩ** |

## More overlap I see

You also likely do **not** need both JST connector packs.

* **JST-PH 3-pin**: useful for MOSFET/motor module connections.
* **JST-PH 5-pin**: probably unnecessary unless a specific board you own uses 5-pin JST-PH.

So I’d cut the **5-pin JST-PH** pack unless you added it for a known connector.

## Lean buy

The lean version is:

```
keep:
- normal diode kit
- resistor kit only if needed
- JST-PH 3-pin
- M12 male pigtail 2-pack
- M12 female pigtail 2-pack
- M12 extension cable
- USB-RS485
- Pico
- Pico RS485 board
- solenoid
- vibration motor
- ToF sensors

cut:
- zener kit if you already have piezo protection parts
- JST-PH 5-pin
- extra M12 quantities
```

So, no: you don’t need all the diode/resistor stuff. **At minimum, make sure you have one normal diode for the solenoid flyback and one 120Ω resistor for RS485 testing.** Everything else is convenience.

[Version=v1.4 | Tag=<c_32> | Sources=none | Assumptions=4 | Cycle=32/3 | Locus=cart-overlap-diodes-resistors]

* * *

**You:**

!<c> 
i usally make my piezos without zeners/diodes

* * *

**ChatGPT:**

<c>

Totally fair — for **piezo-as-audio/contact-mic**, you can often get away without zeners/diodes because it is going into an audio input, preamp, interface, or something already designed to tolerate weird transients.

For **piezo straight into a Pico ADC**, the situation is different: a piezo hit can spike way above 3.3V. The Pico GPIO/ADC pins are not forgiving in the same way an audio input is.

That said: **you do not need to buy the zener kit right now** if you’re comfortable handling piezos yourself.

## Cart answer

Cut the **zener diode kit**.

Keep the **normal diode kit** only if you don’t already have flyback diodes for the solenoid. That kit is for the actuator side, not really the piezo side.

Keep the **resistor kit** only if you don’t already have:

```
120Ω  → RS485 test termination
1MΩ   → piezo bleed
10kΩ  → pullup/pulldown
1kΩ   → signal protection / GPIO sanity
```

So the leanest version:

```
Keep:
- normal diode kit, unless you already have 1N4007 / 1N5819 / similar
- resistor kit, unless you already have 120Ω, 1MΩ, 10kΩ, 1kΩ

Cut:
- zener kit
```

## For your piezo specifically

If you want to keep doing it your way, I’d at least do the basic resistor protection:

```
piezo disc
  ↓
1MΩ resistor across piezo leads
  ↓
series resistor before Pico ADC, maybe 10k–100k
  ↓
Pico ADC
```

That is not as protective as a clamp, but it is much better than raw piezo into ADC.

The safest no-drama version is still:

```
piezo
+ 1MΩ bleed
+ 10k–100k series resistor
+ clamp diodes / zener
```

But if this is a prototype and you’re okay risking a Pico, you can skip the zener kit and just be conservative.

## My cart edit

Delete:

* **AEDIKO zener diode assortment**

Keep or cut depending on what you already own:

* **ALLECIN regular diode assortment** — keep for solenoid flyback unless you already have diodes
* **Avelis resistor kit** — keep only if you don’t already have the key values

The zener kit is the most redundant item in your cart.

[Version=v1.4 | Tag=<c_33> | Sources=none | Assumptions=3 | Cycle=33/3 | Locus=piezo-protection-cart-trim]

* * *

**You:**

!<c> 
so this is everything i need to get this going tomorrow (sans a pc which i'm picking up, a mic which i have, piezo stuff)?

* * *

**ChatGPT:**

<c>

Yes — **this is enough to get a one-object RS485 actuator prototype going tomorrow**, assuming:

* you have a **24V PSU with accessible output terminals** or a barrel-to-screw-terminal adapter
* you have your **MOSFET trigger module**
* you have your **buck converter**
* you have basic hand tools / ferrules / wire stripper
* you are okay with the ToF possibly being a little annoying if the headers are not pre-soldered

The core system is present:

```
PC
→ USB-RS485 adapter
→ M12 cable path
→ Pico + Pico RS485 board
→ MOSFET driver
→ 24V solenoid / 5V vibration module
→ ToF / piezo later
```

## What is truly required from this cart

Keep these:

| Item | Verdict |
| --- | --- |
| USB-to-RS485 adapter | **required** |
| Waveshare Pico RS485 board | **required** |
| Pico W with headers | **required** |
| M12 male panel pigtail | **required** |
| M12 female pigtail | **required** |
| M12 male-to-female cable | **required** |
| Fielect 24V solenoid | **required / good** |
| diode kit | **keep** for flyback protection |
| resistor kit | **keep** unless you already have 120Ω, 1MΩ, 1kΩ, 10kΩ |
| vibration motor module | **keep**; useful second behavior |
| Pico screw-terminal breakout | **keep, but maybe optional** |
| 3-pin JST-PH kit | **keep**; useful for module wiring |

## What is redundant / optional

You can cut these if you want to save a little:

| Item | Cut? | Why |
| --- | --- | --- |
| zener kit | **yes, cut** | mostly for piezo ADC protection; you said you usually handle piezos yourself |
| 5-pin JST-PH kit | **probably cut** | no obvious module here needs 5-pin JST-PH |
| resistor kit | **maybe cut** | only if you already have the needed values |
| Pico screw-terminal breakout | **maybe keep** | may be useful even if it doesn’t stack perfectly |

## The one real warning

The **DiGiYes VL53L0X ToF boards may require soldering headers**. If they arrive as bare boards with loose pin headers, they will not be plug-and-play tomorrow unless you solder them or improvise.

So tomorrow’s first working test may be:

```
RS485 communication
+ Pico
+ solenoid tap
+ vibration motor
+ software heat guardrails
+ maybe piezo
```

Then ToF gets added once the header/connection issue is solved.

If you want ToF to be guaranteed no-solder, swap that item for an Adafruit/STEMMA QT style VL53L0X with the correct cable. But the Amazon 4-pack is cheap enough if you’re okay with possible header soldering later.

## One small safety add, if you don’t already have it

Given your brownout/fire/heat concerns, the only thing I’d still want is:

> **inline fuse holder + 1A or 2A fuse for the 24V object branch**

Not strictly necessary for a bench test with a current-limited PSU, but good practice. For tomorrow, a current-limited bench supply is enough. For installation, fuse every object channel.

## My verdict

**Yes, this gets you going tomorrow.**  
Before placing, I’d personally delete:

* **zener diode kit**
* **5-pin JST-PH kit**

Keep the regular diode kit and resistor kit unless you already have those values on hand.

[Version=v1.4 | Tag=<c_34> | Sources=none | Assumptions=5 | Cycle=34/3 | Locus=prototype-checkout-final]

* * *

**You:**

!<c> 
headers for tof are soldered, i have 24v to 5v buck converter, mosfet trigger module, and a mean well 24 vdc psu

* * *

**ChatGPT:**

<c>

Yes — with those things already on hand, you are **basically good**. The remaining cart is enough to get the first object running tomorrow.

I would make **two final cuts** before placing:

1. **Cut the zener diode kit.**  
    You do not need it for tomorrow if you already know how you like handling piezos, and it is not needed for the solenoid/RS485 side.
2. **Cut the 5-pin JST-PH kit.**  
    I do not see a reason for it in this build. The **3-pin JST-PH kit** is the more likely one to be useful for your trigger/motor/module wiring.

## Keep these

Keep:

* **USB-to-RS485 adapter**
* **Pico W with headers**
* **Waveshare Pico RS485 board**
* **Pico screw-terminal breakout** — optional, but useful enough to keep
* **M12 male panel pigtail 2-pack**
* **M12 female pigtail 2-pack**
* **M12 male-to-female extension cable**
* **Fielect 24V solenoid**
* **VL53L0X ToF sensors**, since headers are soldered
* **vibration motor modules**
* **3-pin JST-PH kit**
* **regular diode assortment**
* **resistor assortment**, unless you already have 120Ω, 1kΩ, 10kΩ, and 1MΩ

## Why keep the regular diode kit?

That kit is not really for piezo. It is for actuator protection.

You want at least one normal diode across the solenoid coil unless your MOSFET trigger module already has proper flyback protection. Since we do not know that module’s exact protection circuit, the diode kit is cheap insurance.

Use something like:

```
1N4007 / 1N540x across solenoid coil
stripe/cathode toward +24V
other side toward MOSFET-switched low side
```

## Why keep the resistor kit?

Only because you need a few boring values:

```
120Ω  = RS485 test termination
1kΩ   = signal sanity / GPIO protection
10kΩ  = pullup / pulldown
1MΩ   = piezo bleed
```

If you already have those, cut the resistor kit too. Otherwise keep it; $5 is worth not being blocked tomorrow.

## Tomorrow’s minimum working chain

You now have enough for:

```
PC
→ USB-RS485 adapter
→ M12 cable path
→ Pico + Waveshare RS485 board
→ MOSFET trigger module
→ 24V solenoid
→ 5V buck
→ ToF / vibration / piezo later
```

The one thing to be religious about:

```
Mean Well 24V GND
Pico GND
MOSFET module GND
RS485 adapter GND if exposed/needed
buck converter GND
```

All of those need a shared reference, or the control signals will behave haunted.

My final checkout recommendation: **delete zener kit, delete 5-pin JST-PH kit, then place it.**

[Version=v1.4 | Tag=<c_35> | Sources=none | Assumptions=4 | Cycle=35/3 | Locus=final-checkout-trim]

* * *

**You:**

!<c> 
let's do this right, give me the best possible prime links for: 
1. mosfets specifically appropriate for this project
2. zener diodes specifically for making piezos for this project

* * *

**ChatGPT:**

<c>

Yes. For **this project**, I would buy **one MOSFET solution** and **one zener/protection solution**. Do not overbuy random module packs.

## 1. MOSFETs appropriate for this project

You need a MOSFET module that can do:

```
Pico 3.3V GPIO signal
→ switch 24V actuator load
→ solenoid / motor / vibration load
→ tolerate PWM / pulses
→ ideally screw terminals
→ ideally flyback protection, or we add diode externally
```

### Best first choice: use the kind you already own

Since you already have:

> Dual High-Power MOSFET Trigger Switch Drive Module, DC 5V–36V, 400W, 15A, PWM adjustment

That is probably appropriate for the **24V solenoid + vibration/motor testing**, as long as it triggers from **3.3V Pico GPIO**.

To buy more of that exact family, use this:

Amazon search: DC 5V-36V 15A MOSFET Trigger Switch Drive Module PWM 0-20KHz

### Best “cleaner electronics” option

This is the one I would buy if you want something closer to a proper microcontroller actuator driver:

Amazon search: Adafruit MOSFET Driver 5648 motors solenoids LEDs

This is ideal in concept because it is made for **motors / solenoids / LEDs**, not just generic switching. It is not always Prime/available, but it is the correct design language.

### Best generic fallback

Search this, and avoid IRF520 boards:

Amazon search: 3.3V 5V logic level MOSFET driver module 5V 36V solenoid motor

Avoid anything that says **IRF520** as the main MOSFET. Those boards are common, cheap, and annoying with 3.3V logic.

**My answer:** do not add MOSFETs today unless you want redundancy. Test the MOSFET trigger modules you already own. If they trigger cleanly from the Pico, you’re good.

## 2. Zener diodes for piezos into Pico ADC

For this project, the piezo input is:

```
piezo contact sensor
→ 1MΩ bleed resistor across piezo
→ 10k–100k series resistor
→ Pico ADC
→ clamp/protection
```

For a Pico ADC, do **not** use 5.1V as the main clamp. Pico ADC/GPIO is **3.3V logic**, so use **3.3V zener** or **3.6V zener/TVS** territory.

### Best exact search

Amazon search: 1N4728A 3.3V zener diode

### Good broader search

Amazon search: BZX55C3V3 3.3V zener diode

### If you want a kit

The **AEDIKO zener kit already in your cart** is acceptable because it includes **3.3V** values. It is more than you need, but it solves the problem.

Amazon search: 3.3V 5.1V zener diode assortment kit

## My final buy recommendation

For today:

* **MOSFETs:** buy **none** unless you want backup. Use your existing 5V–36V MOSFET trigger modules first.
* **Zeners:** keep the **AEDIKO zener kit** only if you want proper Pico ADC piezo protection tomorrow.
* **Regular diode kit:** keep it for solenoid flyback.
* **Resistor kit:** keep it unless you already have 120Ω, 1MΩ, 10kΩ, and 1kΩ.

The only zener value I’d actually reach for first is:

```
3.3V zener across ADC input to GND
with 10k–100k series resistor before it
and 1MΩ across the piezo
```

So: **you do not need lots of zeners, but you do want 3.3V zeners if piezo goes directly into the Pico.**

[Version=v1.4 | Tag=<c_36> | Sources=none | Assumptions=4 | Cycle=36/3 | Locus=mosfet-zener-prime-links]

* * *

**You:**

!<c> 
and for the expansion board? considering you said the current one is kinda meh

* * *

**ChatGPT:**

<c>

For **this checkout**, I would **not upgrade the expansion board right now**. I’d either **keep the cheap Whiteeeen board as a utility breakout** or **delete it entirely** if you’re trimming. It is not central to the system.

The reason: the **Waveshare Pico-2CH-RS485 board is already the important carrier**. The expansion board is only there to make GPIO/power/sensor hookup less annoying. It is not what makes the RS485 object work.

## Best move today

**Keep the Whiteeeen board only if $8 doesn’t bother you.**  
Treat it as a bench breakout / emergency screw-terminal board, not as the final object architecture.

Do **not** buy a second random Pico expansion board today.

## If you want the better search later

The better version to look for is not just “Pico expansion board.” Search specifically:

Amazon search: Raspberry Pi Pico screw terminal expansion board

Amazon search: Raspberry Pi Pico terminal block breakout board

Amazon search: GeeekPi Raspberry Pi Pico screw terminal expansion board

What you want is:

```
Pico plugs in securely
all GPIO broken out to screw terminals
clear labels
access to 3V3 / 5V / GND
reset button preferred
mounting holes preferred
does not require stacking under/over the RS485 board awkwardly
```

## What I would avoid

Avoid anything that is just:

```
Pico prototype board
Pico breadboard adapter
Pico expansion board with only pin headers
Pico board meant for soldered prototyping
```

Those defeat the purpose.

## My cart verdict for the expansion board

For **tomorrow’s prototype**:

* **Need it?** No.
* **Useful?** Yes.
* **Redundant?** Slightly.
* **Dangerous / wrong?** No.
* **Worth keeping at $8?** Yes, unless you’re aggressively trimming.

So: **keep the Whiteeeen if you want a cheap bench convenience. Delete it if you want the absolute lean cart. Do not hunt another expansion board tonight.**

[Version=v1.4 | Tag=<c_37> | Sources=none | Assumptions=3 | Cycle=37/3 | Locus=pico-expansion-board]

* * *

**You:**

https://www.amazon.com/GeeekPi-Raspberry-Terminal-Expansion-Breakout/dp/B0998594PL/ref=sr_1_9?dib=eyJ2IjoiMSJ9.OLvonf94tBXdDMtuFSdgWAW0V9PNGLVwP_cKxD0KeicN1R1DbBx4c-7jHJwUxDL9j6cQmpWXIXipJqZGR80K3Zo0ewxOIneS1qHTS5arHL3hn2VKnvnUfMTW1DbHHaT44e14NJiNY68B3s60VXjNs-sBSJ2V2yLKRL1sQv4HZlZ9ub1JT4FDTjUdE-f1E0T1ZLzsTM-71k5BTTQzseW-o4SgzuQWNahvqlANyrNZtz8.ASTZ2GGqVa-AmC20McCziYxMUPjeY5bhU_Qs5eFr_ts&dib_tag=se&keywords=Raspberry+Pi+Pico+screw+terminal+expansion+board&qid=1779445615&sr=8-9
or https://www.amazon.com/Breakout-Board-Terminal-3-81mm-Raspberry/dp/B0BHZSYTD8/ref=sr_1_6?dib=eyJ2IjoiMSJ9.OLvonf94tBXdDMtuFSdgWAW0V9PNGLVwP_cKxD0KeicN1R1DbBx4c-7jHJwUxDL9j6cQmpWXIXipJqZGR80K3Zo0ewxOIneS1qHTS5arHL3hn2VKnvnUfMTW1DbHHaT44e14NJiNY68B3s60VXjNs-sBSJ2V2yLKRL1sQv4HZlZ9ub1JT4FDTjUdE-f1E0T1ZLzsTM-71k5BTTQzseW-o4SgzuQWNahvqlANyrNZtz8.ASTZ2GGqVa-AmC20McCziYxMUPjeY5bhU_Qs5eFr_ts&dib_tag=se&keywords=Raspberry%2BPi%2BPico%2Bscrew%2Bterminal%2Bexpansion%2Bboard&qid=1779445615&sr=8-6&th=1

* * *

**ChatGPT:**

<c>

Between those two, I’d pick the **second one: the red naughtystarts / B0BHZSYTD8 screw-terminal breakout**.

It is the better replacement for the Whiteeeen board because it has:

* **larger 3.81mm screw terminals**, better for ferruled hookup wire
* **16–26 AWG stated range**, which fits your no-solder workflow
* **clearer layout**
* **mounting holes**
* **SWD access**
* fully assembled terminals

So: **delete the Whiteeeen board and get the B0BHZSYTD8 red board instead.**

But important caveat: do **not** expect this to stack elegantly with the Waveshare Pico-2CH-RS485 board. Both boards want to be the Pico’s “base.” For tomorrow, treat the red screw-terminal board as a **bench/object wiring breakout**, not necessarily as a permanent stack with the RS485 board.

Best practical setup:

```
Pico + Waveshare RS485 board
→ handles RS485 communication

red screw-terminal breakout
→ useful for bench wiring / sensor tests / alternate Pico mounting
```

For the final object, you may decide one wins physically. But for $8.99, the red board is a better utility board than the Whiteeeen one.

My call:

```
Buy: B0BHZSYTD8 red screw-terminal board
Delete: Whiteeeen Pico expansion board
Do not buy both
```

[Version=v1.4 | Tag=<c_38> | Sources=web | Assumptions=3 | Cycle=38/3 | Locus=pico-breakout-choice]

* * *

**You:**

!<c> 
and how would i connect the waveshare rs485 transciever with the pico

* * *

**You:**

!<g>
I bought the pc, what do I do now? Specs:

https://ocdepot.com/product/hp-prodesk-600-g2-sff-i5-6500-3-2ghz-16gb-240gb-ssd-win10-pro-gt635-wifi-desktop/

* * *

**ChatGPT:**

<g>

Great — now this becomes the **room brain**.

The OCDepot listing says this unit is tested/working, boots into a fresh Windows 10 install, includes the **HP ProDesk 600 G2 SFF i5-6500 / 16GB / 240GB SSD**, a **GT 635 graphics card**, 200W HP PSU, and power cord. It also notes that you’ll be responsible for setup, updates, and drivers. [ocdepot.com](https://ocdepot.com/product/hp-prodesk-600-g2-sff-i5-6500-3-2ghz-16gb-240gb-ssd-win10-pro-gt635-wifi-desktop/)

## Do this in order

### 1. When you pick it up: verify, don’t customize

Before wiping anything:

```
boot Windows
confirm it POSTs cleanly
confirm SSD appears
confirm 16GB RAM appears
confirm Ethernet works
confirm USB ports work
confirm audio input/output appears
```

Do not install project software yet. Just prove the machine is not dead.

### 2. Decide OS: I’d wipe to Ubuntu Server

Use **Ubuntu Server LTS**, not Windows, for the installation brain. Canonical currently lists **Ubuntu Server 26.04 LTS** as the latest LTS, with five years of free security/maintenance updates, and its minimum requirements are far below this machine’s specs: 1.5GB RAM, 5GB disk, Intel/AMD 64-bit. [Ubuntu](https://ubuntu.com/download/server)

This HP has enough headroom for:

```
Python / Node / Go control loop
USB-RS485
audio input analysis
logging
watchdog services
local web dashboard
future 8-channel serial interface
```

### 3. Install Ubuntu Server, minimal

During install:

```
hostname: room-brain
username: seb
enable OpenSSH
no desktop environment
use entire 240GB SSD
install security updates
```

Use Ethernet first. Do not waste time debugging Wi-Fi unless you need it.

### 4. BIOS settings before final install

In BIOS/UEFI, look for:

```
restore on AC power loss: ON
secure boot: OFF if Ubuntu install complains
USB boot: ON
wake on LAN: optional
fast boot: OFF during setup
```

The big one is **restore after power loss**. For gallery work, if power blips, the machine should come back.

### 5. After Ubuntu boots

First bring-up checklist:

```
sudo apt update
sudo apt upgrade
lsusb
ip a
arecord -l
dmesg -w
```

Then plug in:

```
USB mic
USB-RS485 adapter
Pico over USB
```

You want the PC to see them before you build the object.

### 6. Treat the GT 635 as optional

The included GT 635 is not important for this project. If the machine boots and displays fine, ignore it for now. Later, if it creates heat/noise/driver weirdness and onboard video works, remove it.

### 7. Tomorrow’s goal

Do not try to finish the artwork tomorrow. The correct first milestone is:

```
Ubuntu boots headless
SSH works
USB-RS485 appears as /dev/ttyUSB*
USB mic appears
Pico can be programmed
one command from PC reaches Pico over RS485
Pico triggers solenoid through MOSFET
```

That proves the actual spine of the system.

### 8. Folder structure

Once Ubuntu is alive:

```
~/objects/
  hub/
  firmware/
  node-01/
  logs/
  notes/
```

Keep the first system boring. The art can be strange; the deployment should not be.

[Version=v1.4 | Tag=<g_39> | Sources=web | Assumptions=4 | Cycle=39/3 | Locus=pc-bringup]

* * *

**You:**

!<c>
Tried booting,and it looks like it POSTs, but monitor display does not appear. Changing the DisplayPort ports changes the light on my monitor from amber to white, but the monitor shows no input in the port warning

* * *

**ChatGPT:**

<c>

This sounds very likely like **the machine is booting, but video is being sent somewhere other than the DisplayPort you’re using**.

Because this PC has a **GT 635 discrete graphics card**, the motherboard DisplayPort ports may be disabled or deprioritized. The monitor changing from amber to white means it detects _something electrically_, but not a valid video signal.

## First thing to try

Look at the back of the PC and separate the ports into two groups:

```
Motherboard video ports:
  vertical cluster near USB / Ethernet / audio

Graphics card video ports:
  lower horizontal expansion-card slot
```

Plug the monitor into the **graphics card**, not the motherboard DisplayPort.

If the GT 635 has DVI/HDMI/VGA and your monitor only has DisplayPort, you may need a different cable or adapter. For testing, use **any monitor/TV that accepts whatever the GT 635 outputs**.

## If that does not work

Do this exact sequence:

1. Power off.
2. Unplug power.
3. Hold the power button for 10 seconds.
4. Reseat the DisplayPort cable on both ends.
5. Try every video output on the **GT 635**, not just the motherboard.
6. Try a different cable/monitor if available.

## If still no display

Remove the GT 635 temporarily.

Then boot with the monitor connected to the motherboard DisplayPort.

That will tell you whether the issue is:

```
GT 635 / display routing problem
vs.
actual PC POST / RAM / motherboard problem
```

If removing the GPU makes the motherboard DisplayPort work, then the PC is fine and the GT 635 was taking over video output.

## Quick health check without video

Plug in a USB keyboard and boot. After ~30–60 seconds, press Caps Lock or Num Lock.

* If the keyboard light toggles: the machine likely booted; this is a video output issue.
* If it does not toggle: it may be hanging during POST.

## My read

Most likely: **you’re plugged into the motherboard DisplayPort while the GT 635 is the active display adapter**.

Try the GT 635 outputs first. If you can’t adapt to those outputs tonight, pull the GT 635 and use onboard DisplayPort.

[Version=v1.4 | Tag=<c_40> | Sources=none | Assumptions=4 | Cycle=40/3 | Locus=pc-no-display]

* * *

**You:**

!<c>
Tried the hdmi as well, nothing. Here’s the back

* * *

**ChatGPT:**

<c>

From the photo: you are currently fighting a **discrete GPU / onboard video routing problem** before assuming the PC is bad.

I can see the **GT 635 low-profile card** in the expansion slot. That means the motherboard DisplayPorts may be disabled, but the GT 635 may also be flaky / outputting on DVI instead of HDMI.

## Do this now

### 1. Try the white DVI port on the graphics card

In the photo, the card has a **white DVI port**. If you have any of these, try it:

```
DVI → HDMI cable
DVI → DVI monitor cable
DVI → HDMI adapter + HDMI cable
```

Do **not** use DisplayPort adapters for this test. DVI/HDMI are electrically closer and less annoying.

### 2. If DVI does not work: remove the GT 635

This is the cleanest test.

Power down, unplug the PC, hold the power button for 10 seconds, then remove the graphics card. After that, plug the monitor into the **motherboard DisplayPort** ports on the left I/O cluster.

Then boot again.

If the motherboard DisplayPort works after removing the card, the PC is fine and the GT 635 was the problem / was hijacking display output.

### 3. If still no display after removing the GPU

Then move to basic POST troubleshooting:

```
unplug power
reseat RAM
try one RAM stick at a time
reseat SSD cables if any
clear CMOS if easy
boot with only power + keyboard + monitor
```

Also plug in a USB keyboard and check whether Caps Lock / Num Lock toggles after 30–60 seconds. If it toggles, the system is probably booting and this is still video-output related. If it does not toggle, it may be hanging before OS/BIOS.

## My read

Most likely order of probability:

1. **GT 635 is taking over video output and you’re not on the active output**
2. **GT 635 is flaky / incompatible with your monitor path**
3. **BIOS is set to discrete-only**
4. **not actually POSTing**

The fastest decisive move is: **pull the GT 635 and test motherboard DisplayPort.** For this installation, you do not need that card anyway.

[Version=v1.4 | Tag=<c_41> | Sources=none | Assumptions=4 | Cycle=41/3 | Locus=pc-video-troubleshoot]

* * *

**You:**

!<c>
There’s HDMI and DVI on the graphics card, DisplayPort on the motherboard. Neither work

* * *

**ChatGPT:**

<c>

Got it. If **GPU HDMI/DVI** and **motherboard DisplayPort** both show nothing, do the decisive isolation test now:

## Step 1: remove the GT 635 entirely

Power off, unplug, hold power button for 10 seconds.

Then remove the graphics card. After it is out, plug the monitor into the **motherboard DisplayPort** only.

This matters because the BIOS may be set to prefer PCIe graphics, but the card may also be dead or not initializing. Removing it should force onboard Intel graphics.

```
GT 635 removed
→ motherboard DisplayPort
→ boot
```

Use a **direct DisplayPort cable** if possible, not a DP-to-HDMI adapter.

## Step 2: boot with the absolute minimum

Before powering back on:

```
power cable
monitor cable
keyboard
nothing else
```

No USB drives, no RS485, no Wi-Fi dongles, no extra peripherals.

## Step 3: watch for POST signs

When you power it:

* Does the keyboard Num Lock / Caps Lock toggle after 30–60 seconds?
* Do you hear any beeps?
* Does the front power light blink in a pattern?
* Do fans spin normally, or does it power-cycle?

If the keyboard toggles, it is likely booting and still a display path issue.  
If the keyboard does not toggle, it may not actually be POSTing.

## Step 4: reseat RAM

If removing the GPU does not fix it:

1. Unplug.
2. Hold power button 10 seconds.
3. Remove both RAM sticks.
4. Reinsert one stick firmly.
5. Try boot.
6. Try the other stick alone.
7. Try the other RAM slot.

A half-seated RAM stick can look exactly like this: lights/fans, maybe monitor wakes, but no actual image.

## Step 5: clear CMOS

After GPU removal + RAM reseat, clear CMOS.

On these office PCs, easiest path is usually:

```
unplug power
remove coin-cell battery
hold power button 15–30 seconds
wait a few minutes
reinstall battery
boot with onboard DisplayPort
```

## My read

At this point, the most likely causes are:

1. **GT 635 is bad / confusing BIOS video routing**
2. **RAM needs reseating**
3. **CMOS/BIOS video setting is stuck**
4. **the refurb is not actually passing video and should be returned**

Do not spend all night on it. If it does not show BIOS after **GPU removed + one RAM stick + motherboard DisplayPort + CMOS reset**, it is a seller problem, not an art-project problem.

[Version=v1.4 | Tag=<c_42> | Sources=none | Assumptions=4 | Cycle=42/3 | Locus=pc-no-video-isolation]

* * *

**You:**

!<c>
Taking the GPU out does nothing

* * *

**ChatGPT:**

<c>

Okay — then we’re past “wrong video port.” Now treat it as **not actually POSTing cleanly**, even if fans/lights come on.

Do this in order, with the **GT 635 still removed**.

## 1. Minimal boot

Unplug everything except:

```
power
keyboard
monitor via motherboard DisplayPort
```

No mouse, no USB drives, no Wi-Fi dongle, no Ethernet, no RS485, no extra anything.

Use a **direct DisplayPort cable**, not DP-to-HDMI, if possible.

## 2. Keyboard test

Power on and wait 60 seconds.

Press **Caps Lock** or **Num Lock**.

* If the keyboard LED toggles: the machine is probably booting, but video path is still weird.
* If it does not toggle: it is probably hanging before/at POST.

## 3. Reseat RAM

This is the next most likely fix.

Power off, unplug, hold power button 10 seconds.

Open it and remove all RAM. Then try:

```
one stick only → slot 1 → boot
same stick → other slot → boot
other stick only → slot 1 → boot
other stick → other slot → boot
```

Make sure the RAM fully clicks in. These office PCs can look alive with badly seated RAM but show no image.

## 4. Clear CMOS

Still with the GPU removed:

```
unplug power
remove coin-cell battery
hold power button 20–30 seconds
wait 2–5 minutes
reinstall coin-cell
boot from motherboard DisplayPort
```

This can clear a stuck “use PCIe graphics first” setting or a bad video/boot state.

## 5. Disconnect the SSD temporarily

A bad drive should not prevent BIOS video, but for isolation:

```
unplug SSD/data/power
boot with only RAM + CPU + motherboard video
```

You should still get BIOS or a “no boot device” message. If not, it is not a Windows/SSD problem.

## 6. Watch the front power LED

HP desktops often communicate faults through blink/beep patterns. Look for:

```
steady white
red blinks
white blinks
beeps
power cycling
fan spin-up then shutdown
```

A blink pattern is useful evidence for the seller.

## My read now

Most likely:

1. RAM not seated / bad RAM stick
2. CMOS/BIOS stuck in a bad display state
3. motherboard/CPU/iGPU issue
4. refurb was not actually tested correctly

After **GPU removed + one RAM stick at a time + CMOS reset + direct motherboard DisplayPort**, it should show BIOS. If it still does nothing, I’d stop troubleshooting and treat it as a return/exchange issue.

[Version=v1.4 | Tag=<c_43> | Sources=none | Assumptions=4 | Cycle=43/3 | Locus=pc-no-post]

* * *

**You:**

!<c>
It’s ram. 4 sticks, took 4 out. Seated stick 1 in slot 1. Heard a beep. No video out though

* * *

**ChatGPT:**

<c>

Good — that’s progress. It means the RAM state changed the machine’s behavior. Now we need to separate **“POST succeeded but no display”** from **“RAM fault beep / still not POSTing.”** POST can report faults through beeps/blinks when there’s no usable display, so the exact beep pattern matters. [Wikipedia](https://en.wikipedia.org/wiki/Power-on_self-test?utm_source=chatgpt.com)

## First: what kind of beep?

Was it:

```
one short beep
```

or:

```
repeating beeps / long beep / pattern
```

**One short beep** often means “I made it through POST.”  
**Repeating or patterned beeps** usually means fault code.

## Do this next

Leave the **GT 635 removed**.

Use:

```
motherboard DisplayPort
one RAM stick
keyboard
power
nothing else
```

Then try this RAM matrix:

```
Stick 1 → DIMM slot labeled 1 / primary
Stick 2 → same slot
Stick 3 → same slot
Stick 4 → same slot
```

Do not assume “slot 1” by position. Look for the tiny motherboard label: **DIMM1**, **DIMM2**, etc. Use the primary/lowest-numbered slot first.

If one stick gives a beep and the others do not, that stick is probably the good one. Then test that good stick in the other slots.

## If it gives one short beep but still no video

Then it may actually be booting. Check:

```
Caps Lock / Num Lock toggles after 30–60 seconds?
front power LED steady, not blinking?
fan sounds normal, not cycling?
```

If yes, try a **VGA output** if that motherboard has one, or a different direct DisplayPort cable/monitor. Older office BIOSes can be weird about DP handshakes.

## If the beep is repeating / patterned

Then stay on RAM:

```
unplug
hold power 10 sec
reseat one stick firmly
try each stick in the same known slot
then try one known-good stick in each slot
```

A bad stick, bad slot, or half-seated DIMM is still the most likely issue.

## If no combination gives video

After testing all sticks:

```
clear CMOS with GPU removed
boot one known-good stick
motherboard DisplayPort
keyboard only
```

If that still gives no BIOS screen, I’d stop and return/exchange it. But you found the right failure zone: **RAM / POST**, not the project hardware.

[Version=v1.4 | Tag=<c_44> | Sources=web | Assumptions=4 | Cycle=44/3 | Locus=ram-post]

* * *

**You:**

!<c>
One short beep. Plugging all 4 in beeps now. Still no video

* * *

**ChatGPT:**

<c>

Good. **One short beep is much better than silence/pattern beeps.** That usually means the machine is getting through POST. So now the problem is likely **video output / display negotiation**, not RAM anymore.

Do this order:

## 1. Stop changing RAM now

If all 4 sticks now give the one short beep, RAM is probably seated enough. Leave it alone for a minute.

Use either:

```
all 4 sticks installed
GT 635 removed
motherboard DisplayPort
keyboard
power
```

or, for cleanest testing:

```
one known-good stick
GT 635 removed
motherboard DisplayPort
keyboard
power
```

## 2. Clear CMOS with the GPU removed

This is the next real move.

```
unplug power
hold power button 20 seconds
remove coin-cell battery
wait 3–5 minutes
press power button again while unplugged
reinstall coin-cell battery
boot with motherboard DisplayPort only
```

The goal is to force BIOS back to integrated graphics / safe defaults.

## 3. Use a direct DisplayPort-to-DisplayPort cable

For BIOS/POST screens, avoid adapters if possible.

Bad test:

```
DisplayPort → HDMI adapter → monitor
```

Better test:

```
DisplayPort cable → DisplayPort monitor
```

If your monitor only has HDMI, then reinstall the GT 635 and test **HDMI from the card** after CMOS reset. But for motherboard video, use true DP if you can.

## 4. Try a different monitor or TV

This matters more than it sounds. Some monitors wake electrically — amber to white — but refuse the preboot signal/resolution and report “no input.”

Try:

```
different monitor
different cable
TV via GPU HDMI
DVI-to-HDMI from GPU if you have it
```

## 5. Try BIOS hotkey blindly

Boot and repeatedly tap:

```
Esc
```

or:

```
F10
```

on HP desktops.

Sometimes the BIOS splash screen is skipped but setup appears on a compatible output.

## 6. If there is VGA, use it

If the motherboard has a VGA port, try that. VGA is ugly but often the most reliable for old office-PC BIOS screens.

## My read now

The one short beep means:

```
CPU probably okay
RAM probably okay
board probably POSTing
video output still not reaching monitor
```

The most likely fixes are:

1. **CMOS reset with GPU removed**
2. **direct DP cable / different monitor**
3. **VGA or DVI fallback**
4. **seller return if no output on any display after CMOS reset**

If CMOS reset + direct motherboard DisplayPort + different monitor still gives no image, I’d treat this as a refurb video failure and exchange it rather than burning the night.

[Version=v1.4 | Tag=<c_45> | Sources=none | Assumptions=4 | Cycle=45/3 | Locus=post-no-video]

* * *

**You:**

!<c>
They have pictures of it POSTing and video output

* * *

**ChatGPT:**

<c>

That photo is useful: it proves the machine **can POST and display BIOS with 16GB RAM installed**. So this is probably not “dead PC.” It is either:

```
display path / cable / monitor handshake
GPU vs onboard routing
RAM got bumped in shipping, now fixed
BIOS video setting / CMOS state
```

## What I’d do now

### 1. Ask/confirm what output they used

The seller photo matters because they got BIOS video somehow. Ask or infer:

> Did they use motherboard DisplayPort, GPU HDMI, GPU DVI, or VGA?

If they used **DVI or VGA**, and you are using **DisplayPort/HDMI**, that explains a lot.

### 2. Recreate the seller test state

The screenshot shows:

```
Memory Size: 16384 MB
BIOS sees all 16GB
```

So reseat **all 4 sticks firmly**, since that is the known-good configuration from the seller.

Then try:

```
GT 635 installed → GPU HDMI
GT 635 installed → GPU DVI
GT 635 removed → motherboard DisplayPort
```

But use **direct cables**, not adapters, wherever possible.

### 3. Try DVI if you can

If the GT 635 has DVI, I would prioritize:

```
GPU DVI → HDMI adapter/cable → monitor/TV
```

or native DVI if you have it.

A lot of these older office PCs/GPUs are much happier showing BIOS over DVI/VGA than over HDMI/DP handshakes.

### 4. Clear CMOS now that RAM is seated

With all RAM reseated:

```
unplug power
hold power button 20 seconds
remove coin-cell battery
wait 3–5 minutes
press power again while unplugged
reinstall battery
boot
```

Then test **motherboard DisplayPort with GPU removed** first.

### 5. If still no image, it’s likely your display path

Since the seller has BIOS proof and you now get a one-short-beep POST, I’d try:

```
different monitor
different DisplayPort cable
TV via GPU HDMI
DVI-to-HDMI from GPU
VGA, if there is a VGA port
```

## My read

You probably fixed the RAM/POST issue by reseating. Now you’re stuck at **preboot video compatibility**. The fastest solve is to copy the seller’s exact video path or try the most primitive output available: **DVI or VGA**.

Do not wipe/install Ubuntu until you can reliably reach BIOS on your own monitor.

[Version=v1.4 | Tag=<c_46> | Sources=none | Assumptions=4 | Cycle=46/3 | Locus=post-proof-video-path]

* * *

**You:**

!<c>
Removed and replaced the cmos but now pressing the power on button does nothing. Device is still lit up inside, pressing the button lights up the indicator on the outside so long as the button is pressed

* * *

**ChatGPT:**

<c>

Okay — that means the board has **standby power**, but it is not accepting the power-on latch. This is usually a **CMOS battery seating / power-drain / front-panel state** issue, not necessarily newly dead hardware.

Do this exactly, slowly:

## 1. Full power drain

```
unplug AC power
remove CMOS coin-cell battery
hold front power button for 30 seconds
wait 2 minutes
```

Do not just tap the button — hold it long enough to discharge the board.

## 2. Reinstall the CMOS battery carefully

Check the coin cell orientation. Usually:

```
+ side / printed side faces outward/up
```

Make sure it is fully under the metal retaining clip and not cocked at an angle.

A badly seated coin cell can create weird “standby only” behavior.

## 3. Boot bare minimum

Before pressing power:

```
GT 635 removed
one known-good RAM stick installed firmly
keyboard plugged in
monitor on motherboard DisplayPort
no USB drives
no Wi-Fi dongle
no Ethernet
```

Then plug AC back in. Wait 10 seconds. Press the power button once normally.

## 4. Watch what happens

Tell me which of these happens:

```
A. fans spin for a moment then stop
B. fans never spin at all
C. power LED only lights while button is physically held
D. power LED stays on after release
E. red/white blink pattern
F. beep pattern
```

The key detail is whether the **fans twitch/spin**.

## 5. If it still only lights while held

Try booting once with the **CMOS battery removed entirely**:

```
AC unplugged
CMOS battery removed
one RAM stick
plug AC in
press power
```

A desktop should usually still power on without the coin cell. If it powers on without the battery, the battery was mis-seated, reversed, shorting, or dead.

## 6. Recheck RAM seating

Since RAM was the earlier issue, reseat the one stick again. It should click hard on both sides. A half-seated DIMM can make the machine refuse to start correctly.

## My read

The most likely causes now are:

1. **CMOS battery not seated correctly**
2. **board needs full discharge after CMOS reset**
3. **RAM got half-seated during the reset work**
4. **front-panel/button state is not latching**
5. less likely: something shorted while handling

Do not reinstall the GPU yet. Get the machine to power-latch with onboard graphics first.

[Version=v1.4 | Tag=<c_47> | Sources=none | Assumptions=4 | Cycle=47/3 | Locus=post-cmos-no-power]

* * *

**You:**

!<c>
Can’t take it out. It’s IN there

* * *

**ChatGPT:**

<c>

Do **not** fight the CMOS battery right now. If it’s wedged in the holder, don’t pry hard and don’t use metal leverage near the board.

For now, leave the CMOS battery **installed**, and just make sure it is:

```
flat in the holder
+ / printed side facing outward/up
under the retaining clip
not tilted
not sitting half-out
```

Then do this:

## 1. Full drain with battery left in

```
unplug AC power
hold front power button for 30–45 seconds
wait 2 minutes
```

## 2. Minimal boot

Leave the **GPU out**.

Use:

```
one RAM stick only
motherboard DisplayPort
keyboard
power cable
nothing else
```

Then plug AC back in, wait 10 seconds, press the power button once.

## 3. If the button only lights while held

That usually means the board has standby power but is not latching on. Check these next:

```
RAM fully clicked in
CMOS battery not crooked
front-panel cable still seated
no loose screw / metal piece touching board
GPU still removed
```

Also try the one RAM stick in a different slot. Since RAM was already the thing that changed behavior, it may still be the immediate fault state.

## 4. If you need to remove the coin cell later

Most coin-cell holders have a tiny metal or plastic retaining lip. The move is usually:

```
push the battery sideways away from the clip
then let one edge pop upward
```

Use a fingernail, plastic spudger, guitar pick, or toothpick. Avoid a metal screwdriver if possible.

## My immediate read

You probably have either:

```
CMOS battery not seated quite right
RAM not fully seated after all the handling
front-panel/power latch in a weird discharged state
```

Do the full drain, leave the battery alone, boot with **one RAM stick + onboard DisplayPort**. Don’t reinstall the GPU until the machine powers on normally again.

[Version=v1.4 | Tag=<c_48> | Sources=none | Assumptions=4 | Cycle=48/3 | Locus=cmos-power-latch]

* * *

**You:**

!<c>
It fails to POST now, boot looped. Beeps then restarts then three beeps

* * *

**ChatGPT:**

<c>

Stop power-cycling it for a minute. **Three beeps after a boot loop is now a RAM/POST fault**, not a monitor issue. POST beep codes are exactly how the machine reports hardware failures when it cannot get to video. [Wikipedia](https://en.wikipedia.org/wiki/Power-on_self-test?utm_source=chatgpt.com)

Do this with the **GPU still removed**.

## Get back to one known-good memory state

1. Unplug AC power.
2. Hold the power button for 30 seconds.
3. Remove **all RAM**.
4. Wait 60 seconds.
5. Put **one stick only** into the motherboard slot actually labeled **DIMM1** or **Slot 1**. Do not trust physical position.
6. Push until both ends fully click/lock.
7. Connect only:
    
    ```
    power
    keyboard
    motherboard DisplayPort
    ```
    
8. Power on.

If it gives **one short beep**, stop. That is the good state.

If it gives **three beeps**, power down and try:

```
same stick → next slot
same stick → next slot
same stick → next slot
```

Then repeat with the next RAM stick.

## What you are looking for

Make a quick matrix mentally:

```
Stick A / Slot 1 = ?
Stick A / Slot 2 = ?
Stick B / Slot 1 = ?
Stick B / Slot 2 = ?
```

The goal is to find either:

```
one good stick + one good slot
```

or prove:

```
all sticks now fail in all slots
```

If **one stick/slot gives one short beep again**, leave it exactly there and do not reinstall the others yet.

## Very likely cause

One of these happened:

* a DIMM is still slightly unseated
* one stick is bad
* one slot is touchy
* the CMOS reset forced memory retraining and it is choking on the current RAM arrangement
* one RAM latch is not fully closed

## Do not do yet

Do not reinstall the GPU.  
Do not put all 4 sticks back in.  
Do not keep trying random video ports.  
Do not install Ubuntu yet.

Get it to this state first:

```
one RAM stick
one short beep
steady power
no boot loop
```

Then we solve video again.

[Version=v1.4 | Tag=<c_49> | Sources=web | Assumptions=4 | Cycle=49/3 | Locus=ram-fault-recovery]

* * *

**You:**

!<c>
We’ve booted. I can see BIOS. Let’s get configured. In the meantime I’m in hell waiting for windows to update for some godforsaken reason. Thank god we’re going Ubuntu

* * *

**ChatGPT:**

<c>

Hell yes. We’re back in the room.

Since BIOS is visible, do **not** chase Windows anymore except to confirm the hardware. We’re going to make this a boring, headless Ubuntu room brain.

## First: do not interrupt only one thing

If Windows is doing a normal Windows update, we do not really care because we’re wiping it.

But if you see anything like:

```
Updating BIOS
HP firmware update
Do not turn off your computer
Writing system firmware
```

do **not** power it off.

Normal Windows update misery is disposable. BIOS/firmware update is not.

## BIOS settings to change

In HP Computer Setup, set these before Ubuntu:

### Main

Confirm:

```
HP ProDesk 600 G2 SFF
i5-6500
Memory: 16384 MB
SSD visible
```

If it sees 16GB, stop touching RAM.

### Advanced / Boot Options

Set:

```
UEFI boot: ON
Legacy boot: OFF or deprioritized
USB boot: ON
Fast Boot: OFF
Boot order: USB first, internal SSD second
```

For the install, you want the Ubuntu USB to be first.

### Security / Secure Boot

For easiest Ubuntu Server install:

```
Secure Boot: OFF
```

Ubuntu can often handle Secure Boot, but for an art-machine / hardware-control box, I’d rather avoid the extra layer while debugging USB serial, drivers, and services.

### Advanced / Power Management

Find and enable:

```
After AC power loss: Power On
```

This is the big gallery setting. If power drops and comes back, the machine should restart itself.

Also enable if present:

```
Wake on LAN: optional
Runtime power management: okay
Deep sleep / ultra low power: OFF if available
```

Deep sleep can make remote/headless recovery more annoying.

### Advanced / Device Options

If the GPU is still removed, use onboard graphics.

Set/confirm:

```
Integrated video: enabled
Primary video: integrated / onboard
```

If there is an “Auto” option, that is fine as long as the GT 635 stays out.

### Storage

If there is an option:

```
SATA mode: AHCI
```

Not RAID/RST.

## Physical configuration I’d use

Leave the **GT 635 out** for now.

For this project, the simplest stable machine is:

```
onboard DisplayPort
onboard Ethernet
16GB RAM
240GB SSD
no discrete GPU
Ubuntu Server
```

The GPU adds heat, driver weirdness, and power draw. We do not need it for RS485, sensors, sound analysis, logging, or a local dashboard.

## Ubuntu install plan

Make a USB installer for **Ubuntu Server LTS**.

During install:

```
Hostname: room-brain
Username: seb
Install OpenSSH server: YES
Use entire disk: YES
LVM: optional, not necessary
Snap server packages: skip
```

Use **Ethernet**, not Wi-Fi, for first setup. Wi-Fi can happen later if needed.

## After install, first commands

Once Ubuntu boots:

```Bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl vim tmux htop python3 python3-venv python3-pip build-essential avahi-daemon
```

Then check hardware:

```Bash
ip a
lsusb
arecord -l
lspci
free -h
df -h
```

## First project milestone

Before touching actuators, make the PC prove itself:

```
boots without monitor
appears on network
SSH works
USB mic appears
USB-RS485 appears as /dev/ttyUSB*
reboots cleanly
comes back after AC power loss
```

Then we connect the object hardware.

[Version=v1.4 | Tag=<c_50> | Sources=none | Assumptions=4 | Cycle=50/3 | Locus=room-brain-bios-config]

* * *

**You:**

!<c>
Okay tell me what to do here

* * *

**ChatGPT:**

<c>

Excellent. BIOS sees:

```
HP ProDesk 600 G2 SFF
i5-6500
16GB RAM
BIOS N02 v02.58
SSD present
```

So: **stop touching RAM. Hardware is alive.**

Do these BIOS changes now.

## 1. Advanced → Boot Options

Set:

```
Startup Menu Delay: 5 sec
Fast Boot: OFF / unchecked
USB Storage Boot: ON / checked
Network PXE Boot: OFF / unchecked
After Power Loss: Power On
Audio Alerts During Boot: ON for now
UEFI Boot Order: USB first, Windows Boot Manager / SSD second
Legacy Boot Order: leave alone or deprioritize
```

The big one for gallery use is:

```
After Power Loss: Power On
```

Right now yours shows **Power Off**. Change that.

## 2. Secure Boot Configuration

Your screen shows:

```
Legacy Support Enable and Secure Boot Disable
```

For Ubuntu, better is:

```
Legacy Support Disable and Secure Boot Disable
```

Use that if it exists in the dropdown.

If it does **not** exist, keep:

```
Legacy Support Enable and Secure Boot Disable
```

But when booting the installer, make sure you choose the **UEFI USB** entry, not the legacy USB entry.

## 3. Advanced → System Options

Set:

```
Turbo Boost: ON
Multi-processor: ON
Virtualization Technology (VT-x): ON
Virtualization Technology for Directed I/O (VT-d): ON
PCIe slots: ON
```

You do not strictly need virtualization for the object controller, but it is useful and harmless for a Linux machine that may later run containers, local services, or ML/audio tooling.

## 4. GPU

Leave the GT 635 **out** for now.

Use:

```
motherboard DisplayPort
integrated Intel graphics
```

The discrete card caused unnecessary ambiguity. This installation brain does not need it.

## 5. Save BIOS

Hit **Save**, then exit.

If you have the Ubuntu USB ready, reboot and immediately press:

```
Esc → F9 Boot Menu
```

Choose:

```
UEFI: your USB drive
```

Do **not** choose a plain non-UEFI USB option.

## 6. Ubuntu install choices

During install:

```
Ubuntu Server
Use entire disk
Install OpenSSH server: YES
Hostname: room-brain
Username: seb
No snaps/packages needed during installer
```

Use Ethernet for setup if possible.

## 7. After Ubuntu boots

First commands:

```Bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl vim tmux htop python3 python3-venv python3-pip build-essential avahi-daemon
```

Then check:

```Bash
ip a
lsusb
arecord -l
free -h
df -h
```

Do not worry about Windows anymore. The machine’s new job is:

```
headless Ubuntu room brain
USB mic
USB-RS485
object controller
watchdog/reboot-safe installation machine
```

[Version=v1.4 | Tag=<c_51> | Sources=none | Assumptions=4 | Cycle=51/3 | Locus=bios-config]

* * *

**You:**

!<c>
Great. Now guide me through installing Ubuntu again, can’t find my earlier install media from tmayd 

* * *

**ChatGPT:**

<c>

Perfect. We’ll make a fresh installer and wipe Windows.

Use **Ubuntu Server**, not Desktop. Canonical lists **Ubuntu Server 26.04 LTS** as the current LTS, with five years of free security/maintenance updates; the ISO is about **3GB**, and the install path is download ISO → make bootable USB → boot from USB. [Ubuntu](https://ubuntu.com/download/server)

## Phase 1: make the USB installer

You need:

```
8GB+ USB stick
another computer, or this HP once Windows stops being Windows
Ubuntu Server ISO
Rufus / balenaEtcher / Raspberry Pi Imager
```

If you are making it from **Windows**, use Rufus. Ubuntu’s own Windows guide says to download the Ubuntu ISO, launch Rufus, select the USB stick, select the ISO, then click Start; the guide notes a 4GB+ USB is enough, but I’d use 8GB+ because USB sticks are cheap and annoying. [Ubuntu](https://ubuntu.com/tutorials/create-a-usb-stick-on-windows)

### Download

Get:

```
Ubuntu Server 26.04 LTS
Intel/AMD 64-bit ISO
```

Do **not** download ARM.

### Rufus settings

In Rufus:

```
Device: your USB stick
Boot selection: Ubuntu Server ISO
Partition scheme: GPT
Target system: UEFI
File system: FAT32 if offered, otherwise default
Start
```

If Rufus asks:

```
ISO mode or DD mode?
```

Choose **ISO mode** first. If the USB fails to boot, remake it in **DD mode**.

## Phase 2: boot the HP from USB

Plug the USB installer into the HP.

Power on and hit:

```
Esc
```

Then:

```
F9 Boot Menu
```

Choose the entry that says something like:

```
UEFI: USB Drive
```

Do **not** choose the non-UEFI/legacy USB entry.

## Phase 3: Ubuntu Server install choices

When the installer starts:

```
Language: English
Keyboard: English / US
Network: Ethernet if possible
Proxy: blank
Mirror: default
Storage: Use entire disk
Disk: the 240GB SSD
LVM: no, unless Ubuntu strongly defaults to it
Encrypt disk: no for now
```

This will wipe Windows. Good.

For profile:

```
Your name: seb
Server name: room-brain
Username: seb
Password: something you can type under stress
```

When asked:

```
Install OpenSSH server?
```

Choose:

```
YES
```

When asked about featured snaps/packages:

```
Skip all
```

Keep it boring.

## Phase 4: first boot

When install completes, remove the USB when prompted, then reboot.

Log in, then run:

```Bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl vim tmux htop python3 python3-venv python3-pip build-essential avahi-daemon
```

Then check the machine:

```Bash
hostname
ip a
free -h
df -h
lsusb
arecord -l
```

## Phase 5: make it headless-friendly

Once Ubuntu is installed and Ethernet is connected, from another computer you should be able to SSH in with:

```Bash
ssh seb@room-brain.local
```

If that fails, use the IP address shown by:

```Bash
ip a
```

Then:

```Bash
ssh seb@<ip-address>
```

## One important BIOS reminder

Before final headless use, set:

```
After Power Loss: Power On
Fast Boot: Off
USB Boot: On
Secure Boot: Disabled
Legacy Support: Disabled if possible
```

Then this thing becomes the installation brain: plug in USB mic, USB-RS485, and eventually run the object-controller service.

[Version=v1.4 | Tag=<c_52> | Sources=web | Assumptions=4 | Cycle=52/3 | Locus=ubuntu-install]

* * *

**You:**

!<c>
I have a WiFi card. Help me set up WiFi 

* * *

**ChatGPT:**

<c>

Yes — the installer sees the card:

```
wlp2s0
Qualcomm Atheros / AR93xx Wireless Network Adapter
```

So you should be able to configure it right here.

## Do this on this screen

Use arrow keys to highlight:

```
wlp2s0  wlan  not connected
```

Press **Enter**.

You should get a menu. Choose something like:

```
Edit Wi-Fi
Connect to Wi-Fi network
Configure Wi-Fi
```

Then enter:

```
SSID: your Wi-Fi network name
Password: your Wi-Fi password
IPv4: Automatic / DHCP
IPv6: Automatic or Disabled
```

Then save/confirm.

After a few seconds, `wlp2s0` should change from:

```
disabled / not connected
```

to something like:

```
connected
DHCPv4: 192.168.x.x
```

Then choose:

```
Done
```

not “Continue without network.”

## If it does not show a Wi-Fi menu

Highlight `wlp2s0`, press Enter, and look for:

```
Enable
Edit
Add Wi-Fi network
```

If it still only says disabled with no Wi-Fi options, choose **Continue without network** and we’ll configure Wi-Fi after installation with Netplan. That is totally fine; the machine can still become the room brain.

## If Wi-Fi connects but install complains later

Do not worry. For the installation, network is only needed for updates/packages. The critical thing is that Ubuntu gets installed.

After install, we can do:

```Bash
ip a
nmcli dev wifi list
nmcli dev wifi connect "YOUR_WIFI_NAME" password "YOUR_PASSWORD"
```

or configure it with Netplan if NetworkManager is not installed.

## Best path tonight

Try `wlp2s0 → Enter → Edit Wi-Fi`.

If it connects, continue normally and make sure **OpenSSH Server** is selected later. If it refuses, continue without network and we’ll bring Wi-Fi up after first boot.

[Version=v1.4 | Tag=<c_53> | Sources=none | Assumptions=3 | Cycle=53/3 | Locus=ubuntu-wifi-installer]

* * *

**You:**

!<c>
What about a proxy address

* * *

**ChatGPT:**

<c>

Leave **proxy address blank**.

A proxy is only for networks where an institution/company explicitly gives you something like:

```
http://proxy.school.edu:8080
```

or

```
http://username:password@proxy.example.com:3128
```

For normal home Wi-Fi, phone hotspot, studio router, gallery network, etc.:

```
Proxy address: [blank]
```

Then continue.

The only fields you should need are:

```
Wi-Fi SSID
Wi-Fi password
DHCP / automatic IP
Proxy: blank
Mirror: default
```

If the installer later asks for an Ubuntu archive mirror, just accept the default.

[Version=v1.4 | Tag=<c_54> | Sources=none | Assumptions=2 | Cycle=54/3 | Locus=ubuntu-proxy]

* * *

**You:**

!<c>
Partition is correct?


* * *

**ChatGPT:**

<c>

The image you sent is not the Ubuntu partition screen — it looks like a phone health/activity screenshot. So I can’t verify the exact partition layout from that image.

For this machine, the correct Ubuntu Server partition choice is:

```
Use entire disk
Disk: CT240BX500SSD1 / 240GB SSD
LVM: optional, but I would choose NO
Encryption: NO
Format / wipe disk: YES
```

You want something conceptually like:

```
/boot/efi   small FAT32 EFI partition
/           main ext4 partition using most of the disk
```

Do **not** manually preserve Windows unless you intentionally want dual boot. For the room-brain machine, wipe it.

If the installer shows a confirmation like:

```
This will delete existing partitions on CT240BX500SSD1
```

that is correct.

If it asks between:

```
Use an entire disk
Custom storage layout
```

choose:

```
Use an entire disk
```

If it asks:

```
Set up this disk as an LVM group
```

I’d uncheck it for simplicity. LVM is fine, but unnecessary here.

Send the actual partition screen before hitting destructive confirmation if you want me to sanity-check it.

[Version=v1.4 | Tag=<c_55> | Sources=none | Assumptions=3 | Cycle=55/3 | Locus=ubuntu-partition]

* * *

**You:**



* * *

**ChatGPT:**

<c>

Yes, the **disk is correct**:

```
CT240BX500SSD1
local disk 223.570G
```

That is the internal 240GB SSD. This will wipe Windows, which is what we want.

Change only one thing:

```
[ ] Set up this disk as an LVM group
```

Right now it looks checked. I’d **uncheck LVM** for this machine. LVM is fine, but unnecessary for a simple installation brain, and plain partitions are easier to recover/debug later.

Leave these as:

```
[X] Use an entire disk
[ ] Encrypt the LVM group with LUKS
[ ] Also create a recovery key
( ) Custom storage layout
```

So final state should be:

```
[X] Use an entire disk
    CT240BX500SSD1  local disk 223.570G
[ ] Set up this disk as an LVM group
[ ] Custom storage layout
```

Then continue.

When it shows the destructive confirmation screen, it should say it will wipe/reformat the `CT240BX500SSD1` disk. That is correct.

[Version=v1.4 | Tag=<c_56> | Sources=none | Assumptions=2 | Cycle=56/3 | Locus=ubuntu-storage]

* * *

**You:**



* * *

**ChatGPT:**

<c>

Yes — this is correct.

It shows Ubuntu will install to:

```
CT240BX500SSD1_2021E3FC5EFE
223.570G
```

with:

```
/boot/efi   1.049G   fat32
/           222.518G ext4
```

That is exactly what we want: simple UEFI boot partition plus one large root partition. No LVM, no encryption, no Windows preservation.

The other disk:

```
VendorC_ProductCode...
29.296G
```

is your USB installer / Ventoy drive. Leave that alone. It is only “in use” because you booted from it.

Proceed to **Done**. On the next warning screen, it will say something like **this will destroy data on CT240BX500SSD1**. That is correct. Confirm it.

[Version=v1.4 | Tag=<c_57> | Sources=none | Assumptions=2 | Cycle=57/3 | Locus=ubuntu-storage-confirm]

* * *

**You:**

!<c>
And now name, servers name, username 

* * *

**ChatGPT:**

<c>

Use this:

```
Your name: Seb
Server's name: room-brain
Username: seb
Password: something you can type fast and remember
```

For the **server name**, avoid spaces, apostrophes, underscores, or uppercase. Use:

```
room-brain
```

That gives you nice SSH later:

```Bash
ssh seb@room-brain.local
```

If it rejects the hyphen for any reason, use:

```
roombrain
```

But `room-brain` should be fine.

[Version=v1.4 | Tag=<c_58> | Sources=none | Assumptions=1 | Cycle=58/3 | Locus=ubuntu-identity]

* * *

**You:**



* * *

**ChatGPT:**

<c>

Skip all of these.

On the **Featured server snaps** screen, leave everything unchecked:

```
[ ] microk8s
[ ] nextcloud
[ ] wekan
[ ] canonical-livepatch
[ ] rocketchat-server
[ ] mosquitto
[ ] etcd
[ ] powershell
[ ] sabnzbd
[ ] wormhole
[ ] aws-cli
[ ] slcli
[ ] doctl
[ ] keepalived
[ ] prometheus
[ ] lxd
```

Then go to **Done** / continue.

Why: these are optional server applications. They are not needed for the room-brain. We’ll install only what we need later with `apt`, so the machine stays clean and predictable.

The one thing you **did** want earlier was:

```
Install OpenSSH server: yes
```

If you already selected OpenSSH on the previous screen, you’re good. If not, finish the install anyway; we can install it later from the terminal.

[Version=v1.4 | Tag=<c_59> | Sources=none | Assumptions=2 | Cycle=59/3 | Locus=ubuntu-snaps]

* * *

**You:**

!<e> --<g>
Fresh install successful. Consider this a clean server. Let’s begin with project setup. Conceptually, what’s the next step? I’ll likely feed this cycle into codex for real code, so keep this cycle to concepts, harnesses, and pseudocode only.

* * *

**ChatGPT:**

<g>

The next step is **not writing the artwork yet**. The next step is building the **room-brain harness**: a boring, observable control system that can later host the behavior.

The goal of this phase is:

```
Ubuntu server becomes a repeatable installation appliance.

It can:
1. see its devices
2. name its devices
3. talk to one object node
4. receive sensor state
5. issue actuator commands
6. enforce safety limits locally and centrally
7. log everything
8. restart cleanly after failure
```

## Conceptual system stack

Think of the project as five layers.

```
[5] Artwork behavior
    ecological / animal / social dynamics, hiding, calling, fatigue, silence

[4] Room model
    global speech/prosody state, human presence, object neighborhood state

[3] Control protocol
    messages between room brain and object nodes

[2] Hardware abstraction
    serial ports, RS485, mic input, node IDs, actuator channels

[1] Deployment harness
    systemd services, logs, config files, watchdogs, startup scripts
```

Right now, build layers **1–3**. Do not start with layer 5.

## The next real milestone

The next successful milestone should be:

```
room-brain boots
→ controller service starts
→ finds USB-RS485 adapter
→ loads object config
→ polls NODE_01
→ receives heartbeat
→ sends TAP command
→ NODE_01 enforces safety
→ solenoid taps
→ event is logged
```

That is the first spine of the piece.

## Project folder concept

Conceptually:

```
/opt/object-ecology/
  config/
    room.yaml
    nodes.yaml
    safety.yaml
  hub/
    room_brain
    serial_bus
    scheduler
    logger
    watchdog
  firmware/
    pico_node/
  tools/
    scan_devices
    test_serial
    test_solenoid
    test_tof
    replay_log
  logs/
    events.jsonl
    health.jsonl
```

The important thing is separation:

```
config = what this installation is
hub = what the computer does
firmware = what each object does
tools = what you use while debugging
logs = what happened
```

## Define the object contract first

Before behavior, define what an object _is_.

Each object should have an identity:

```
node_id: CAN_01
surface_type: metal_can
actuators:
  - solenoid_tapper
  - vibration_motor
sensors:
  - tof_distance
  - piezo_contact
local_traits:
  skittishness: 0.8
  sociability: 0.4
  fatigue_rate: 0.6
  recovery_rate: 0.2
```

The room brain does not need to know every wire. It should know the object as an entity.

## Message protocol

Keep the first protocol brutally small.

Room brain to node:

```
PING
SET_MODE
TAP
VIBRATE
QUIET
RESET_FATIGUE
REQUEST_STATE
```

Node to room brain:

```
PONG
STATE
ACK
ERROR
SAFETY_REFUSAL
```

The most important message is not `TAP`. It is:

```
SAFETY_REFUSAL
```

That is where the object says:

```
I heard you, but I will not do that because I am hot / tired / cooling down / uncertain.
```

That refusal is conceptually central. It gives the object a body.

## Pseudocode: room brain loop

```
load room config
load node config
open serial bus
open audio input
start logger

every tick:
    read room mic features
    update global room state

    for each node:
        poll node state
        update object model

    compute social/ecological pressure:
        who wants to speak?
        who is hiding?
        who is fatigued?
        who is being watched?
        who is influencing whom?

    choose possible gestures

    for each gesture:
        check central safety budget
        send command to node

    log:
        room state
        node state
        command
        refusal/ack
        resulting behavior
```

## Pseudocode: node firmware loop

```
boot
load node_id
initialize sensors
initialize actuator pins
initialize RS485
initialize local safety state

loop:
    read ToF
    read piezo
    update local presence
    update local resonance
    cool down heat/fatigue model

    if serial command received:
        parse command

        if command violates local safety:
            refuse command
            report SAFETY_REFUSAL

        else:
            execute gesture
            update heat/fatigue
            report ACK

    periodically:
        send STATE if polled
```

The node should never be a dumb actuator. It should be a small body with veto power.

## Safety model

This should exist before interesting behavior.

Central safety:

```
max total taps per minute
max simultaneous actuators
max room loudness response
emergency quiet state
watchdog restart
```

Local safety:

```
max solenoid pulse length
minimum cooldown
rolling duty-cycle budget
temperature/fatigue estimate
hard refusal state
```

For the solenoid:

```
requested tap duration → local clamp → actual tap duration

if requested > max:
    refuse or clamp

if fatigue too high:
    refuse

if cooldown active:
    refuse
```

## Behavior model comes after harness

Once the harness works, the artwork behavior can be layered in.

The serious version is not:

```
human approaches → object reacts
```

It is:

```
objects maintain a private ecology
human presence interrupts the ecology
objects suppress, displace, or reroute behavior
neighboring objects inherit pressure
the room remembers interruptions
fatigue changes future willingness
```

This gives you Toy Story without Furby.

## First behavior primitive

The first real behavior should be **withdrawal**, not performance.

```
if no human presence:
    objects communicate with taps and tremors

if human presence increases:
    local object suppresses overt sound
    neighboring objects receive pressure
    far object may answer quietly

if speech/prosody becomes intense:
    global system increases inhibition
    objects become more still
    self-sensing remains active
```

The object does not “respond to what you say.”  
It behaves as if human language changes the weather.

## What Codex should build first

Feed Codex a first implementation target like this:

```
Build a minimal Ubuntu room-brain harness for a networked actuator installation.

Do not implement final artwork behavior yet.

Implement:
1. config loading
2. serial transport abstraction
3. fake node simulator
4. real RS485 serial adapter option
5. event logger
6. safety budget model
7. command scheduler
8. CLI tools:
   - scan
   - ping-node
   - tap-node
   - monitor
9. systemd service template
10. clean restart behavior
```

The reason to include a fake node simulator is critical: you should be able to test the room-brain without hardware attached.

## Order of operations

Do it in this order:

```
1. host harness
2. fake node
3. real serial link
4. Pico heartbeat
5. Pico command parser
6. one safe actuator command
7. event logging
8. watchdog/systemd
9. ToF input
10. piezo input
11. behavior engine
12. room audio/prosody model
```

Do **not** start with audio ML. Start with the control spine.

## The conceptual next step

Define the **protocol and safety contract** before defining the “intelligence.”

That is what makes this a robust cybernetic installation instead of a pile of reactive gadgets.

[Version=v1.4 | Tag=<g_60> | Sources=none | Assumptions=4 | Cycle=1/3 | Locus=room-brain-harness]

* * *

**You:**

!<o>
Great. Let’s start. Setup and concept = you; any coding or programming = codex, via ssh. This is the handoff point, and I will likely come back for: concept refinement, repo parity to concept, prompt drift, prompting the next large phase in the project.

* * *

**ChatGPT:**

<o>

Yes. This is the correct handoff point. The next move is to give Codex a **bounded engineering brief**, not the whole artwork.

## Project handoff frame

This machine is now:

```
room-brain
```

Its first job is not intelligence, not ML, not final behavior. Its first job is to become a **reliable cybernetic control appliance** for one object node.

The first deliverable should prove:

```
Ubuntu server boots
→ controller harness starts
→ config loads
→ fake node works
→ serial transport abstraction exists
→ logs are written
→ safety model can refuse unsafe commands
→ systemd service can restart cleanly
```

Only after that should hardware enter the loop.

## Conceptual architecture

```
room-brain/
  deployment harness
  device discovery
  serial transport
  node protocol
  safety engine
  event logger
  fake node simulator
  CLI debug tools
  later: audio/prosody model
  later: ecological behavior engine
```

The artwork logic should sit **above** the control harness, not inside it.

The system should remain structured around this principle:

```
central room brain proposes behavior
local node verifies safety
object may refuse
refusal is logged
refusal becomes part of the artwork
```

## Codex phase 0 prompt

Give Codex something like this:

```
We are setting up a fresh Ubuntu Server machine named room-brain for a networked cybernetic actuator installation.

Do not implement final artwork behavior yet.

Build the first project scaffold and control harness for a future RS485/Pico object network.

Project name: object-ecology

Goals:
1. Create a clean repo structure.
2. Implement config-driven architecture.
3. Implement a fake node simulator so the room-brain can be tested without hardware.
4. Implement a serial transport abstraction, but do not require real RS485 hardware yet.
5. Implement a minimal node protocol: PING, PONG, STATE, TAP, VIBRATE, QUIET, ACK, ERROR, SAFETY_REFUSAL.
6. Implement central safety budgets.
7. Implement structured JSONL event logging.
8. Implement CLI tools for testing.
9. Provide a systemd service template but do not enable it automatically until manual tests pass.
10. Produce a README explaining setup, concepts, and next steps.

Repository shape should be conceptually:

/opt/object-ecology/
  config/
    room.yaml
    nodes.yaml
    safety.yaml
  hub/
    main controller logic
    serial transport
    fake transport
    scheduler
    safety model
    logger
  firmware/
    pico_node/
  tools/
    scan
    ping-node
    tap-node
    monitor
    simulate-node
  logs/
    events.jsonl
    health.jsonl
  systemd/
    object-ecology.service
  README.md

Do not connect to actuators yet.
Do not assume final ML/audio behavior yet.
Do not hardcode hardware paths.
All devices should be configurable.
All commands should log intent, result, timestamp, node id, and safety status.

The first acceptance test is:
- start fake node
- run ping-node
- receive PONG
- run tap-node
- fake node either ACKs or SAFETY_REFUSALs depending on configured heat/fatigue state
- logs are written to logs/events.jsonl
```

## Codex phase 0 acceptance tests

Codex should stop when these are true:

```
1. Repo exists and is readable.
2. README explains purpose and setup.
3. Config files exist and are loaded.
4. Fake node can simulate one object.
5. CLI can ping fake node.
6. CLI can request a tap from fake node.
7. Safety engine can refuse a tap.
8. All events are logged as JSONL.
9. No hardware is required to run tests.
10. There is a clear next step for real RS485 transport.
```

## Do not let Codex drift into these yet

Not yet:

```
audio ML
speech recognition
semantic tone analysis
multi-object ecology
temperature sensors
Pico firmware complexity
real solenoid firing
web dashboard
database
Docker
Kubernetes
MQTT
Home Assistant
OSC
Ableton
```

Those can all come later. Right now the repo needs a **spine**.

## Conceptual invariant

Every future phase should preserve this:

```
The artwork is not a reactive sculpture.
It is an ecology of small bodies with local limits, social pressure, memory, and refusal.
```

That means the engineering must always support:

```
state
memory
fatigue
presence
neighbor influence
local veto
central logging
recoverable failure
```

## What to bring back to me after Codex phase 0

Bring back:

```
repo tree
README
config files
protocol description
CLI names
sample log output
what Codex chose for language/runtime
any deviations from this brief
```

Then I’ll check for:

```
concept/repo parity
prompt drift
overengineering
missing safety contracts
whether the system still supports the artwork
```

## Assumptions

1. `room-brain` is a clean Ubuntu Server install.
2. Codex will SSH into the machine and do all code/file creation.
3. The first hardware target is still one Pico/RS485 object node.
4. Final behavior remains object ecology / concealed life / presence-induced inhibition.
5. We are prioritizing reliability over cleverness.

## Tests

The first successful cycle is not “the solenoid taps.”  
The first successful cycle is:

```
the system can command, refuse, log, and recover without hardware.
```

Then the second cycle becomes:

```
fake node replaced by real RS485 node.
```

Then the third cycle becomes:

```
real node controls one actuator under local safety limits.
```

[Version=v1.4 | Tag=<o_61> | Sources=none | Assumptions=5 | Cycle=2/3 | Locus=codex-handoff]

* * *

**You:**

!<o>
I’d like to give it the full project context though. I will bundle this chat in the repo likely. Output the best possible codex prompt to get us ready


We are setting up a fresh Ubuntu Server machine named room-brain for a networked cybernetic actuator installation.

Do not implement final artwork behavior yet.

Build the first project scaffold and control harness for a future RS485/Pico object network.

Project name: object-ecology

Goals:
1. Create a clean repo structure.
2. Implement config-driven architecture.
3. Implement a fake node simulator so the room-brain can be tested without hardware.
4. Implement a serial transport abstraction, but do not require real RS485 hardware yet.
5. Implement a minimal node protocol: PING, PONG, STATE, TAP, VIBRATE, QUIET, ACK, ERROR, SAFETY_REFUSAL.
6. Implement central safety budgets.
7. Implement structured JSONL event logging.
8. Implement CLI tools for testing.
9. Provide a systemd service template but do not enable it automatically until manual tests pass.
10. Produce a README explaining setup, concepts, and next steps.

Repository shape should be conceptually:

/opt/object-ecology/
  config/
    room.yaml
    nodes.yaml
    safety.yaml
  hub/
    main controller logic
    serial transport
    fake transport
    scheduler
    safety model
    logger
  firmware/
    pico_node/
  tools/
    scan
    ping-node
    tap-node
    monitor
    simulate-node
  logs/
    events.jsonl
    health.jsonl
  systemd/
    object-ecology.service
  README.md

Do not connect to actuators yet.
Do not assume final ML/audio behavior yet.
Do not hardcode hardware paths.
All devices should be configurable.
All commands should log intent, result, timestamp, node id, and safety status.

The first acceptance test is:
- start fake node
- run ping-node
- receive PONG
- run tap-node
- fake node either ACKs or SAFETY_REFUSALs depending on configured heat/fatigue state
- logs are written to logs/events.jsonl

* * *

**ChatGPT:**

<o>

Here is the full Codex handoff prompt I’d use.

```
You are working over SSH on a fresh Ubuntu Server machine named `room-brain`.

This machine is the central room computer for a networked cybernetic actuator installation. The project is called:

object-ecology

This is an artwork, but this phase is not about final artistic behavior yet. This phase is about building a clean, testable, restartable control harness that can later support RS485-connected Pico-based object nodes.

The user may include a bundled chat transcript in this repository for context. Treat that as project background, not as implementation requirements unless confirmed in this prompt.

PROJECT CONTEXT

The installation will eventually consist of a singular object or a small ecology of everyday object-bodies: tin cans, bowls, ceramic vessels, trays, boxes, or small clusters. Each object has actuators inside or attached to its body. The objects make sound through their own material bodies: tapping, trembling, humming, scraping, shifting, rotating, or withdrawing.

The conceptual model is not “AI sculptures that react to what you say.” Avoid that. The objects are not Furby-like characters. They should be modeled as small cybernetic bodies with local limits, presence-awareness, memory, fatigue, and refusal.

The key artistic premise:

- The objects have a private ecology.
- They communicate or co-respond when humans are not present.
- Human presence interrupts, suppresses, inhibits, or reroutes the ecology.
- The objects do not simply perform for viewers.
- They may become quieter when watched.
- Speech/prosody may eventually act like weather in the room, not like semantic command-following.
- Each object has a body and local limits.
- The room brain may propose behavior, but object nodes should be able to refuse unsafe or impossible commands.
- Refusal is conceptually important and must be represented in the system architecture.

The engineering principle:

central room brain proposes behavior
local node verifies safety
object may refuse
refusal is logged
refusal becomes part of the artwork

Current hardware direction:

- Fresh Ubuntu Server machine: room-brain
- Future connection: USB-to-RS485 from room-brain
- Future object node: Raspberry Pi Pico / Pico W with RS485 transceiver
- Actuators: 24V solenoid tapper, vibration motor, later possibly servo/gearmotor
- Sensors: ToF proximity, piezo/contact self-sensing, later room audio/prosody
- Power: external Mean Well 24V PSU, local 24V-to-5V buck converters
- Physical connector language: M12-style object connectors
- Long-term topology may become an 8-channel private snake, with each object having its own RS485/power channel. Do not implement that yet.

THIS PHASE

Do not implement final artwork behavior yet.

Build the first project scaffold and control harness.

The first milestone is not “make the solenoid tap.” The first milestone is:

- room-brain boots
- controller harness starts
- config loads
- fake node works without hardware
- serial transport abstraction exists
- safety model can refuse unsafe commands
- JSONL logs are written
- CLI tools can test the system
- systemd service template exists but is not enabled automatically

IMPLEMENTATION REQUIREMENTS

Create the project at:

/opt/object-ecology

If permissions require it, create the directory with sudo and chown it to the current user.

Use a boring, robust implementation. Python is preferred unless there is a strong reason not to use it.

Use a local virtual environment if needed.

Avoid Docker, Kubernetes, MQTT, databases, web dashboards, ML, speech recognition, OSC, Ableton integration, or audio feature extraction in this phase.

Do not hardcode device paths like `/dev/ttyUSB0` into source code. They may appear in config defaults or examples only.

All behavior should be config-driven.

All logs should be append-only JSONL.

The repo should be readable and understandable to a future maintainer.

REPOSITORY SHAPE

Create this structure, adjusting only where necessary for idiomatic Python packaging:

/opt/object-ecology/
  README.md
  config/
    room.yaml
    nodes.yaml
    safety.yaml
  hub/
    __init__.py
    main.py
    config.py
    protocol.py
    transports.py
    fake_node.py
    scheduler.py
    safety.py
    logger.py
  firmware/
    pico_node/
      README.md
      PROTOCOL.md
  tools/
    scan
    ping-node
    tap-node
    vibrate-node
    quiet-node
    monitor
    simulate-node
  logs/
    events.jsonl
    health.jsonl
  systemd/
    object-ecology.service
  tests/
    test_protocol.py
    test_safety.py
    test_fake_node.py

If using a Python package layout, keep the public CLI names above.

CONFIG REQUIREMENTS

Create example config files.

room.yaml should include:

- room_id
- log paths
- transport mode: fake or serial
- serial settings placeholder:
  - device
  - baud
  - timeout
- tick rate / poll interval
- emergency quiet flag
- startup mode

nodes.yaml should define at least one fake node:

node_id: CAN_01
surface_type: metal_can
enabled: true
transport_channel: fake
actuators:
  - solenoid_tapper
  - vibration_motor
sensors:
  - tof_distance
  - piezo_contact
traits:
  skittishness
  sociability
  fatigue_rate
  recovery_rate

safety.yaml should define central safety budgets and local/default node safety budgets:

- max total taps per minute
- max taps per node per minute
- max simultaneous actuators
- max solenoid pulse duration ms
- minimum solenoid cooldown ms
- rolling duty cycle window seconds
- max rolling on-time per window
- vibration max duration ms
- emergency quiet behavior

PROTOCOL REQUIREMENTS

Implement a minimal message protocol.

Commands from room-brain to node:

- PING
- REQUEST_STATE
- TAP
- VIBRATE
- QUIET
- SET_MODE
- RESET_FATIGUE

Responses from node to room-brain:

- PONG
- STATE
- ACK
- ERROR
- SAFETY_REFUSAL

Represent messages internally as structured objects/dicts, and serialize them in a clear line-delimited JSON format suitable for serial transport later.

Each message should include:

- timestamp
- message_type
- node_id
- command_id or correlation_id
- payload
- safety_status when relevant

Do not overcomplicate this. Keep it inspectable.

FAKE NODE REQUIREMENTS

Implement a fake node simulator that behaves enough like a real object node to test the room-brain without hardware.

Fake node should maintain state:

- node_id
- online/offline
- heat/fatigue value
- last_tap_time
- current_mode
- fake tof/proximity value
- fake piezo/contact/ring value
- actuator availability

Fake node should respond to:

PING -> PONG
REQUEST_STATE -> STATE
QUIET -> ACK and set quiet/suppressed state
TAP -> ACK or SAFETY_REFUSAL
VIBRATE -> ACK or SAFETY_REFUSAL
RESET_FATIGUE -> ACK and lower fatigue/heat state

Fake node should enforce local safety rules before acknowledging TAP or VIBRATE.

A fake node must be able to refuse a TAP because of cooldown, fatigue, emergency quiet, or max pulse duration.

SAFETY MODEL REQUIREMENTS

Safety is not optional. It is part of the conceptual model.

Implement central safety in the room brain:

- rate limit total commands
- rate limit commands per node
- reject commands when emergency quiet is active
- optionally clamp requested durations before sending

Implement local/fake node safety:

- hard max solenoid pulse duration
- minimum cooldown between taps
- rolling heat/fatigue model
- refusal when hot/fatigued
- recovery over time

Important: do not only clamp silently. The system should be capable of producing explicit SAFETY_REFUSAL events.

A refusal is a first-class event.

LOGGING REQUIREMENTS

Write structured JSONL logs to:

logs/events.jsonl
logs/health.jsonl

Every command attempt should log:

- timestamp
- node_id
- command
- requested payload
- allowed/refused/clamped
- reason if refused
- response type
- transport mode
- correlation_id

Every health heartbeat should log:

- timestamp
- node_id
- online/offline
- fatigue/heat
- mode
- last_seen
- sensor summary if available

CLI REQUIREMENTS

Create executable CLI tools in `tools/`.

At minimum:

tools/simulate-node
- Starts fake node mode or runs a fake-node demo.
- Should not require hardware.

tools/ping-node CAN_01
- Loads config.
- Uses fake transport by default.
- Sends PING.
- Prints PONG result.
- Logs event.

tools/tap-node CAN_01 --duration-ms 50
- Sends a TAP command.
- Applies central safety.
- Fake node applies local safety.
- Prints ACK or SAFETY_REFUSAL.
- Logs event.

tools/vibrate-node CAN_01 --duration-ms 500
- Same idea for vibration.

tools/quiet-node CAN_01
- Sends QUIET.
- Logs event.

tools/monitor
- Prints recent fake node state / health in a simple loop.
- No curses UI required.

tools/scan
- For now, lists configured transports/nodes.
- If pyserial is installed, optionally list available serial ports.
- Do not fail if pyserial is missing.

SYSTEMD REQUIREMENTS

Create:

systemd/object-ecology.service

It should be a template/example service that runs the room-brain main loop.

Do not enable it automatically.

README should explain how to install it later.

README REQUIREMENTS

README must explain:

1. What object-ecology is.
2. What this phase implements.
3. What this phase intentionally does not implement.
4. How to create/use the Python environment.
5. How to run fake-node tests.
6. How to run the CLI tools.
7. How logs work.
8. How the protocol works.
9. How safety/refusal works.
10. How real RS485 will be added later.
11. How systemd will be enabled later.
12. Current acceptance tests.

PSEUDOCODE MODEL TO PRESERVE

Room brain loop:

load room config
load node config
open selected transport
start logger

loop:
    poll configured nodes
    update health state
    accept scheduled or CLI command
    check central safety budget
    send command to node
    receive response
    log command, response, and refusal
    sleep until next tick

Fake node loop:

load node config
initialize local safety state

on command:
    if PING:
        return PONG
    if REQUEST_STATE:
        return STATE
    if QUIET:
        enter quiet mode
        return ACK
    if TAP:
        evaluate local cooldown/fatigue/max duration/emergency quiet
        if unsafe:
            return SAFETY_REFUSAL with reason
        else:
            simulate tap
            update fatigue/heat
            return ACK
    if VIBRATE:
        evaluate duration/fatigue/emergency quiet
        return ACK or SAFETY_REFUSAL

NEXT-PHASE PLACEHOLDERS

Add placeholders or docs for later phases, but do not implement them now:

Phase 1:
- real RS485 serial transport
- Pico heartbeat
- Pico command parser

Phase 2:
- one actuator command to real solenoid through Pico/MOSFET
- local firmware safety limits

Phase 3:
- ToF sensor integration
- piezo/contact sensing

Phase 4:
- room audio/prosody analysis

Phase 5:
- multi-object ecological behavior engine

DO NOT DO IN THIS PHASE

Do not implement final artwork behavior.
Do not implement audio ML.
Do not implement speech recognition.
Do not install Docker.
Do not create a database.
Do not create a web dashboard.
Do not integrate MQTT.
Do not integrate Home Assistant.
Do not connect to actuators.
Do not assume real hardware is present.
Do not enable systemd automatically.
Do not hardcode serial device paths.
Do not make the fake node too clever.
Do not bury safety checks inside opaque logic.

ACCEPTANCE TESTS

When finished, these should work from /opt/object-ecology:

1. The repo tree exists and matches the intended structure.

2. README.md explains the concept and setup clearly.

3. Config loads successfully.

4. Fake node can be addressed as CAN_01.

5. Running:

   tools/ping-node CAN_01

   prints a PONG-like response and logs an event.

6. Running:

   tools/tap-node CAN_01 --duration-ms 50

   prints ACK if safety allows and logs the command.

7. Running repeated tap commands too quickly produces SAFETY_REFUSAL.

8. Running:

   tools/tap-node CAN_01 --duration-ms 9999

   produces clamp or SAFETY_REFUSAL according to the safety config, and logs the reason.

9. logs/events.jsonl contains structured JSON lines with timestamp, node_id, command, result, safety status, and reason where relevant.

10. tests pass, or if tests are not fully implemented, the README states exactly what works and what remains.

FINAL RESPONSE FORMAT

When done, report back with:

- repo tree
- runtime/language choices
- how to run setup
- how to run acceptance tests
- sample CLI output
- sample JSONL log line
- any deviations from this prompt
- next recommended phase

Do not proceed into real hardware without explicit confirmation.
```

## Assumptions

1. Codex will SSH into `room-brain`.
2. The system is a clean Ubuntu Server install.
3. The repo can live at `/opt/object-ecology`, with ownership adjusted for your user.
4. We are treating the chat transcript as conceptual context, not a substitute for the acceptance tests.
5. The next phase after this is RS485/Pico communication, not final behavior.

## Tests

This prompt is successful if Codex returns a boring but working scaffold where:

```
fake node works
safety refusal works
logs are inspectable
CLI tools exist
systemd is only templated
real hardware is not required yet
```

[Version=v1.4 | Tag=<o_62> | Sources=none | Assumptions=5 | Cycle=3/3 | Locus=codex-full-project-prompt]