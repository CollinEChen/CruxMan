import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

interface Joint {
  x: number;
  y: number;
}

interface Hold {
  id: string;
  type: string;
  x: number;
  y: number;
  assignedLimb: string;
  grip: string;
}

interface AnalysisRequest {
  wallIncline: number;
  climberHeight: number;
  climberWeight: number;
  joints: { [name: string]: Joint };
  holds: Hold[];
  selectedAnalysisHoldId: string;
}

interface MuscleUsed {
  name: string;
  percentage: number;
  lbs: number;
}

interface AnalysisResponse {
  holdTotalLbs: number;
  holdPercentageOfBodyWeight: number;
  musclesUsed: MuscleUsed[];
  biomechanicalBreakdown: string;
}

const SYSTEM_PROMPT = `You are a biomechanics expert specializing in rock climbing. Your task is to analyze the FORCE EXERTED ON A SPECIFIC HOLD during a climbing position.

CRITICAL PHYSICS PRINCIPLES - You MUST follow these:
1. If the selected hold is the ONLY handhold or primary hold supporting the climber's weight, the force on it will be AT LEAST the climber's body weight (often 1.0x to 1.5x body weight due to leverage).
2. Force on a handhold = (body weight) × (lever arm ratio) × (wall angle multiplier). Lever arm ratio = distance from COM to wall / distance from hold to COM.
3. On steep overhangs (>90°), arms bear 60-90% of body weight. On vertical walls with feet on holds, arms bear 30-50%.
4. When both hands are on holds and feet are on footholds, distribute body weight across all contact points based on their positions.
5. The body's center of mass creates torque that amplifies force on handholds. A handhold far above the COM gets more load.
6. Wall angle effect: Overhang multiplies force. A 45° overhang creates ~1.4× force. Vertical walls = 1×. Slab walls = 0.7×.

IMPORTANT HOLD TYPE EFFECTS:
- Crimps: load finger flexors and A2 pulleys heavily, small contact surface
- Jugs: easy grip, distribute load well, forearm-friendly
- Slopers: load forearms heavily, require open-hand strength
- Pinches: load thumbs and grip strength
- Pockets: isolate 2-3 fingers, high localized stress
- Sidepulls: lateral load on shoulders and back
- Footholds: depend on wall angle, smear requires friction
- Underclings: load shoulders, chest, triceps
- Hueco/Rail: grip strength dependent
- Smear: friction-only, highly dependent on wall angle

Only return muscles ACTIVELY ENGAGING with the selected hold. For a left-hand crimp, include: left fingers, left forearm, back muscles. Do NOT include uninvolved muscles.

Allowed muscles: bicep, fingers, forearm, tricep, shoulders, back, quads, hamstrings, calves, chest, abs.

You MUST respond with valid JSON ONLY, using EXACTLY this structure (no markdown, no code fences, no explanation):

{
  "holdTotalLbs": number (total force in lbs on this hold, MUST be at least 30% of body weight for handholds),
  "holdPercentageOfBodyWeight": number (percentage of body weight, MUST be at least 30 for handholds),
  "musclesUsed": [
    { "name": "string (muscle name)", "percentage": number (0-100), "lbs": number (force contributed by this muscle) }
  ],
  "biomechanicalBreakdown": "string (2-3 sentence explanation of force distribution and mechanics)"
}`;

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json();

    // Validate required fields
    if (
      typeof body.wallIncline !== "number" ||
      typeof body.climberHeight !== "number" ||
      typeof body.climberWeight !== "number" ||
      !body.joints ||
      !Array.isArray(body.holds) ||
      !body.selectedAnalysisHoldId
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Find the selected hold
    const selectedHold = body.holds.find(h => h.id === body.selectedAnalysisHoldId);
    if (!selectedHold) {
      return NextResponse.json(
        { error: "Selected hold not found" },
        { status: 400 }
      );
    }

    // Build dynamic user prompt from input
    const userPrompt = buildUserPrompt(body, selectedHold);

    // Initialize Gemini client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(userPrompt);

    if (!result.response.text()) {
      return NextResponse.json(
        { error: "Analysis failed" },
        { status: 500 }
      );
    }

    // Parse and clean the response
    let responseText = result.response.text().trim();
    console.log("Raw Gemini response:", responseText);

    // Strip markdown code fences if present
    if (responseText.startsWith("```json")) {
      responseText = responseText.slice(7); // Remove ```json
    } else if (responseText.startsWith("```")) {
      responseText = responseText.slice(3); // Remove ```
    }

    if (responseText.endsWith("```")) {
      responseText = responseText.slice(0, -3); // Remove trailing ```
    }

    responseText = responseText.trim();

    // Parse JSON response
    let analysisResponse: any;
    try {
      analysisResponse = JSON.parse(responseText);
    } catch (e) {
      // If AI returned invalid JSON, fall through to physics-based calculation
      analysisResponse = {};
    }

    // Compute physics-based force estimate as a reference/fallback
    const physicsForce = computePhysicsForce(body, selectedHold);
    const physicsPercentage = (physicsForce / body.climberWeight) * 100;

    // Validate and normalize the response structure.
    let holdTotalLbs = typeof analysisResponse.holdTotalLbs === "number" ? analysisResponse.holdTotalLbs : physicsForce;
    let holdPercentage = typeof analysisResponse.holdPercentageOfBodyWeight === "number" ? analysisResponse.holdPercentageOfBodyWeight : physicsPercentage;

    // If the AI returned something unreasonably low, use physics estimate instead
    const isHandhold = ["crimp", "jug", "sloper", "pinch", "pocket", "sidepull", "undercling", "hueco", "rail"].includes(selectedHold.type);
    const minForce = isHandhold ? Math.max(body.climberWeight * 0.3, physicsForce * 0.7) : physicsForce * 0.5;
    if (holdTotalLbs < minForce) {
      holdTotalLbs = Math.round(physicsForce * 10) / 10;
      holdPercentage = Math.round(physicsPercentage * 10) / 10;
    }

    // Recalculate muscle lbs based on corrected total force if they don't sum up
    let musclesUsed: MuscleUsed[] = Array.isArray(analysisResponse.musclesUsed) ? analysisResponse.musclesUsed.map((m: any) => ({
      name: typeof m.name === "string" ? m.name : "unknown",
      percentage: typeof m.percentage === "number" ? m.percentage : 0,
      lbs: typeof m.lbs === "number" ? m.lbs : 0,
    })) : [];

    // Scale muscle forces to match the corrected holdTotalLbs
    const muscleTotal = musclesUsed.reduce((sum, m) => sum + m.lbs, 0);
    if (muscleTotal > 0 && Math.abs(muscleTotal - holdTotalLbs) > 5) {
      const scale = holdTotalLbs / muscleTotal;
      musclesUsed = musclesUsed.map(m => ({
        ...m,
        lbs: Math.round(m.lbs * scale * 10) / 10,
      }));
    }

    const validatedResponse: AnalysisResponse = {
      holdTotalLbs,
      holdPercentageOfBodyWeight: holdPercentage,
      musclesUsed,
      biomechanicalBreakdown: typeof analysisResponse.biomechanicalBreakdown === "string" ? analysisResponse.biomechanicalBreakdown : "",
    };

    return NextResponse.json(validatedResponse);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * Compute a physics-based approximation of the force on a hold.
 * Uses lever mechanics + wall angle to produce realistic force estimates.
 */
function computePhysicsForce(body: AnalysisRequest, selectedHold: Hold): number {
  const weight = body.climberWeight;

  const handHolds = body.holds.filter(h =>
    h.assignedLimb && (h.assignedLimb === "leftHand" || h.assignedLimb === "rightHand")
  );
  const footHolds = body.holds.filter(h =>
    h.assignedLimb && (h.assignedLimb === "leftFoot" || h.assignedLimb === "rightFoot")
  );
  const isSelectedHandHeld = handHolds.some(h => h.id === selectedHold.id);
  const isSelectedFootHeld = footHolds.some(h => h.id === selectedHold.id);

  // Determine how many limbs are supporting weight
  const numHandsOnHolds = handHolds.length;
  const numFeetOnHolds = footHolds.length;

  // Wall angle multiplier: steep = more weight on hands
  // incline is 0-90 where 90 is vertical wall
  // For overhang (incline < 90), arms bear more. For slab, legs bear more.
  const wallAngleRad = (body.wallIncline * Math.PI) / 180;
  // At 90° (vertical): sin(90) = 1, multiplier = 1
  // At 45° (overhang): sin(45) ≈ 0.707, multiplier ≈ 1.41
  // At 0° (flat): sin(0) = 0, approaches infinity
  const wallMultiplier = body.wallIncline > 0 ? 1 / Math.sin(wallAngleRad) : 2;

  // Base load distribution between hands and feet
  // Steeper walls put more weight on hands
  let handShare: number;
  if (body.wallIncline >= 90) {
    // Vertical or slab: hands carry ~40% of weight with feet on holds
    handShare = 0.4 * (numHandsOnHolds > 0 ? 1 : 0.8);
  } else {
    // Overhang: hands carry more
    const overhangFactor = (90 - body.wallIncline) / 45; // 0 at vertical, 1 at 45°
    handShare = 0.4 + overhangFactor * 0.5; // 0.4 at vertical, 0.9 at 45°
    handShare = Math.min(0.95, handShare);
  }

  // If no feet on holds, all weight is on hands
  if (numFeetOnHolds === 0) {
    handShare = Math.min(1.0, handShare + 0.3);
  }
  // If no hands on holds, all weight is on feet
  if (numHandsOnHolds === 0) {
    handShare = 0;
  }

  // Lever arm effect: distance from COM (approximated as pelvis position) to the hold
  const pelvis = body.joints["pelvis"];
  if (pelvis && selectedHold) {
    // Vertical distance from pelvis to hold (positive = hold is above pelvis)
    const vertDist = pelvis.y - selectedHold.y;
    // Lever effect: the further above the pelvis, the more the body weight pulls on it
    const leverMultiplier = 1 + Math.max(0, vertDist / 200); // up to ~2x based on height above
    // Apply lever to the share
    if (isSelectedHandHeld) {
      const handForce = weight * handShare * wallMultiplier * leverMultiplier;
      // Distribute among hands
      return handForce / Math.max(1, numHandsOnHolds);
    } else if (isSelectedFootHeld) {
      const footForce = weight * (1 - handShare) * wallMultiplier;
      return footForce / Math.max(1, numFeetOnHolds);
    } else {
      // Hold not assigned to any limb - estimate based on position
      const estShare = handHolds.length > 0 ? handShare / (handHolds.length + 1) : handShare;
      return weight * estShare * wallMultiplier;
    }
  }

  // Fallback: simple estimate based on wall angle and assigned limb
  const totalHoldsOnSameLimbType = isSelectedHandHeld ? Math.max(1, numHandsOnHolds) : Math.max(1, numFeetOnHolds);
  if (isSelectedHandHeld) {
    return weight * handShare * wallMultiplier / totalHoldsOnSameLimbType;
  } else if (isSelectedFootHeld) {
    return weight * (1 - handShare) * wallMultiplier / totalHoldsOnSameLimbType;
  }

  // Default fallback: 30% of body weight
  return weight * 0.3;
}

function buildUserPrompt(body: AnalysisRequest, selectedHold: Hold): string {
  const wallAngleLabel =
    body.wallIncline > 135
      ? "steep overhang (>45° past vertical)"
      : body.wallIncline > 90
        ? "overhang"
        : body.wallIncline === 90
          ? "vertical"
          : "slab";

  const jointDescriptions = Object.entries(body.joints)
    .map(([name, pos]) => `${name}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`)
    .join(", ");

  const assignedLimbLabel = selectedHold.assignedLimb
    ? ` Currently held by: ${selectedHold.assignedLimb}.`
    : " (Not currently assigned to a limb)";

  // Convert height from inches to cm (the frontend sends inches)
  const heightCm = Math.round(body.climberHeight * 2.54);

  return `Analyze the force exerted ON THIS SPECIFIC HOLD:
- Hold ID: ${selectedHold.id}
- Hold Type: ${selectedHold.type}
- Hold Position: (${selectedHold.x.toFixed(1)}, ${selectedHold.y.toFixed(1)})${assignedLimbLabel}

Climbing Position:
- Climber: ${heightCm} cm tall, ${body.climberWeight} lbs
- Wall angle: ${body.wallIncline}° (${wallAngleLabel})
- Body position (joint coordinates): ${jointDescriptions}
- Limb assignments: ${body.holds.filter(h => h.assignedLimb).map(h => `${h.id}→${h.assignedLimb}`).join(", ")}

Calculate the total force exerted specifically on hold #${selectedHold.id} (${selectedHold.type}), considering the climber's weight, position, wall angle, and grip style. Return muscles actively engaging with this hold only. Do NOT include muscles that are not involved with this specific hold.

IMPORTANT: If this is a handhold and the climber's entire body weight is supported by holds, the force on a single handhold should be AT LEAST 30% of body weight (often 50-100% depending on steepness and leverage).`;
}