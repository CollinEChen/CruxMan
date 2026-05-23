
"use client";
import Image from "next/image";


import { useRef, useEffect, useState } from "react";
import Matter, { Engine, Render, World, Bodies, Body, Constraint, Composite, Mouse, MouseConstraint, Events } from "matter-js";



const WALL_BG = "#F0EDE8";
const WALL_GRID = "#E5E7EB";
const WALL_HOLE = "#D1D5DB";
const WALL_SHADOW = "rgba(0,0,0,0.10)";
const WALL_WIDTH = 700;
const WALL_HEIGHT = 900;
const HOLE_SPACING = 40;
const HOLE_RADIUS = 3;

const HOLD_TYPES = [
  { key: "jug", name: "Jug", color: "#22C55E" },
  { key: "crimp", name: "Crimp", color: "#3B82F6" },
  { key: "sloper", name: "Sloper", color: "#A855F7" },
  { key: "pinch", name: "Pinch", color: "#EAB308" },
  { key: "pocket", name: "Pocket", color: "#EF4444" },
  { key: "sidepull", name: "Sidepull", color: "#06B6D4" },
  { key: "foothold", name: "Foothold", color: "#6B7280" },
  { key: "undercling", name: "Undercling", color: "#F97316" },
  { key: "hueco", name: "Hueco", color: "#EC4899" },
  { key: "rail", name: "Rail", color: "#14B8A6" },
  { key: "smear", name: "Smear", color: "#9CA3AF" },
];

function drawHold(ctx: CanvasRenderingContext2D, hold: { x: number; y: number; type: string; id: string; assignedLimb?: string; grip?: string }, scale = 1) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 8 * scale;
  ctx.translate(hold.x, hold.y);
  ctx.lineWidth = 2 * scale;
  switch (hold.type) {
    case "jug": // D-shape
      ctx.fillStyle = "#22C55E";
      ctx.beginPath();
      ctx.arc(0, 0, 18 * scale, Math.PI * 0.15, Math.PI * 1.85, false);
      ctx.lineTo(-18 * scale, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "crimp": // thin rectangle
      ctx.fillStyle = "#3B82F6";
      ctx.fillRect(-14 * scale, -4 * scale, 28 * scale, 8 * scale);
      break;
    case "sloper": // large oval
      ctx.fillStyle = "#A855F7";
      ctx.beginPath();
      ctx.ellipse(0, 0, 20 * scale, 13 * scale, 0, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case "pinch": // tall oval
      ctx.fillStyle = "#EAB308";
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 * scale, 18 * scale, 0, 0, 2 * Math.PI);
      ctx.fill();
      break;
    case "pocket": // circle with hole
      ctx.fillStyle = "#EF4444";
      ctx.beginPath();
      ctx.arc(0, 0, 14 * scale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(0, 0, 6 * scale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
    case "sidepull": // teardrop rotated
      ctx.fillStyle = "#06B6D4";
      ctx.rotate(-Math.PI / 2.5);
      ctx.beginPath();
      ctx.moveTo(0, -15 * scale);
      ctx.quadraticCurveTo(13 * scale, 0, 0, 15 * scale);
      ctx.quadraticCurveTo(-13 * scale, 0, 0, -15 * scale);
      ctx.fill();
      break;
    case "foothold": // small square
      ctx.fillStyle = "#6B7280";
      ctx.fillRect(-6 * scale, -6 * scale, 12 * scale, 12 * scale);
      break;
    case "undercling": // inverted D-shape
      ctx.fillStyle = "#F97316";
      ctx.beginPath();
      ctx.arc(0, 0, 16 * scale, Math.PI * 1.15, Math.PI * 0.85, true);
      ctx.lineTo(16 * scale, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "hueco": // large circle outline
      ctx.strokeStyle = "#EC4899";
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, 18 * scale, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    case "rail": // long thin rectangle
      ctx.fillStyle = "#14B8A6";
      ctx.fillRect(-22 * scale, -4 * scale, 44 * scale, 8 * scale);
      break;
    case "smear": // dashed rounded square — friction-only, foot only
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#9CA3AF";
      ctx.lineWidth = 1.5 * scale;
      ctx.setLineDash([3 * scale, 3 * scale]);
      ctx.beginPath();
      ctx.roundRect(-10 * scale, -10 * scale, 20 * scale, 20 * scale, 3 * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    default:
      break;
  }
  ctx.restore();
}

// Stickman proportions (relative to height)
const STICKMAN_PROPORTIONS = {
  head: 0.13, // diameter
  torso: 0.28, // length
  upperArm: 0.16,
  lowerArm: 0.14,
  hand: 0.06,
  upperLeg: 0.22,
  lowerLeg: 0.18,
  foot: 0.08,
};

const STICKMAN_COLOR = "#1A1A1A";
const HOVER_GLOW = "#FF6B35";

// Maps getStickmanJoints() display names → bodies object keys
const JOINT_TO_BODY: Record<string, string> = {
  head: "head", neck: "torso", torso: "torso",
  leftShoulder: "leftUpperArm", leftElbow: "leftLowerArm", leftHand: "leftHand",
  rightShoulder: "rightUpperArm", rightElbow: "rightLowerArm", rightHand: "rightHand",
  pelvis: "pelvis",
  leftHip: "leftUpperLeg", leftKnee: "leftLowerLeg", leftFoot: "leftFoot",
  rightHip: "rightUpperLeg", rightKnee: "rightLowerLeg", rightFoot: "rightFoot",
};

function drawWall(ctx: CanvasRenderingContext2D, incline: number) {
  // Clear
  ctx.clearRect(0, 0, WALL_WIDTH, WALL_HEIGHT);
  // Wall background
  ctx.save();
  ctx.fillStyle = WALL_BG;
  ctx.fillRect(0, 0, WALL_WIDTH, WALL_HEIGHT);
  // Subtle wood/matte effect (flat, but can add noise later)
  ctx.restore();
  // Draw grid lines
  ctx.save();
  ctx.strokeStyle = WALL_GRID;
  ctx.lineWidth = 1;
  for (let x = HOLE_SPACING / 2; x < WALL_WIDTH; x += HOLE_SPACING) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WALL_HEIGHT);
    ctx.stroke();
  }
  for (let y = HOLE_SPACING / 2; y < WALL_HEIGHT; y += HOLE_SPACING) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WALL_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
  // Draw holes
  ctx.save();
  ctx.fillStyle = WALL_HOLE;
  for (let x = HOLE_SPACING / 2; x < WALL_WIDTH; x += HOLE_SPACING) {
    for (let y = HOLE_SPACING / 2; y < WALL_HEIGHT; y += HOLE_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, HOLE_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
  // Incline overlay (simulate overhang)
  if (incline < 90) {
    // Shadow should be at the bottom for overhang
    const gradient = ctx.createLinearGradient(0, WALL_HEIGHT, 0, 0);
    const strength = (90 - incline) / 45; // 0 at 90°, 1 at 45°
    gradient.addColorStop(0, `rgba(0,0,0,${0.18 * strength})`); // bottom
    gradient.addColorStop(0.7, "rgba(0,0,0,0)"); // fade to top
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WALL_WIDTH, WALL_HEIGHT);
    ctx.restore();
  }
}

// Utility to get stickman body part positions from Matter.js bodies
function getStickmanJoints(bodies: Record<string, Matter.Body>) {
  return {
    head: bodies.head.position,
    neck: bodies.torso.position,
    torso: bodies.torso.position,
    leftShoulder: bodies.leftUpperArm.position,
    leftElbow: bodies.leftLowerArm.position,
    leftHand: bodies.leftHand.position,
    rightShoulder: bodies.rightUpperArm.position,
    rightElbow: bodies.rightLowerArm.position,
    rightHand: bodies.rightHand.position,
    pelvis: bodies.pelvis.position,
    leftHip: bodies.leftUpperLeg.position,
    leftKnee: bodies.leftLowerLeg.position,
    leftFoot: bodies.leftFoot.position,
    rightHip: bodies.rightUpperLeg.position,
    rightKnee: bodies.rightLowerLeg.position,
    rightFoot: bodies.rightFoot.position,
  };
}

function drawStickman(ctx: CanvasRenderingContext2D, bodies: Record<string, Matter.Body>, hoveredJoint: string | null, draggedJoint: string | null, pelvisAnchored = false) {
  const joints = getStickmanJoints(bodies);
  const headR = Math.min(20, bodies.head.circleRadius ?? 20);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = STICKMAN_COLOR;
  ctx.lineWidth = 2.5;

  // Neck: head center down to shoulder level
  ctx.beginPath();
  ctx.moveTo(joints.head.x, joints.head.y);
  ctx.lineTo(joints.neck.x, joints.neck.y);
  ctx.stroke();

  // Shoulder crossbar
  ctx.beginPath();
  ctx.moveTo(joints.leftShoulder.x, joints.leftShoulder.y);
  ctx.lineTo(joints.rightShoulder.x, joints.rightShoulder.y);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(joints.leftShoulder.x, joints.leftShoulder.y);
  ctx.lineTo(joints.leftElbow.x, joints.leftElbow.y);
  ctx.lineTo(joints.leftHand.x, joints.leftHand.y);
  ctx.moveTo(joints.rightShoulder.x, joints.rightShoulder.y);
  ctx.lineTo(joints.rightElbow.x, joints.rightElbow.y);
  ctx.lineTo(joints.rightHand.x, joints.rightHand.y);
  ctx.stroke();

  // Torso + pelvis Y-shape
  ctx.beginPath();
  ctx.moveTo(joints.neck.x, joints.neck.y);
  ctx.lineTo(joints.pelvis.x, joints.pelvis.y);
  ctx.lineTo(joints.leftHip.x, joints.leftHip.y);
  ctx.moveTo(joints.pelvis.x, joints.pelvis.y);
  ctx.lineTo(joints.rightHip.x, joints.rightHip.y);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(joints.leftHip.x, joints.leftHip.y);
  ctx.lineTo(joints.leftKnee.x, joints.leftKnee.y);
  ctx.lineTo(joints.leftFoot.x, joints.leftFoot.y);
  ctx.moveTo(joints.rightHip.x, joints.rightHip.y);
  ctx.lineTo(joints.rightKnee.x, joints.rightKnee.y);
  ctx.lineTo(joints.rightFoot.x, joints.rightFoot.y);
  ctx.stroke();

  // Head — filled black circle, capped at 20px radius
  ctx.beginPath();
  ctx.arc(joints.head.x, joints.head.y, headR, 0, 2 * Math.PI);
  ctx.fillStyle = STICKMAN_COLOR;
  ctx.fill();

  // Joints — small black dots with 1px white border, skip head
  Object.entries(joints)
    .filter(([k]) => k !== "head")
    .forEach(([joint, pos]) => {
      const isActive = hoveredJoint === joint || draggedJoint === joint;
      ctx.save();
      if (joint === "pelvis") {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = draggedJoint === "pelvis" ? HOVER_GLOW : STICKMAN_COLOR;
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, 2 * Math.PI);
        ctx.strokeStyle = (isActive || pelvisAnchored) ? HOVER_GLOW : "#D1D5DB";
        ctx.lineWidth = 2;
        if (isActive || pelvisAnchored) { ctx.shadowColor = HOVER_GLOW; ctx.shadowBlur = isActive ? 8 : 4; }
        ctx.stroke();
        ctx.restore();
        return;
      }
      const isLimb = ["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(joint);
      const r = isActive ? (isLimb ? 10 : 6) : (isLimb ? 8 : 5);
      if (isActive) { ctx.shadowColor = HOVER_GLOW; ctx.shadowBlur = 8; }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = STICKMAN_COLOR;
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

  ctx.restore();
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [incline, setIncline] = useState(75);
  const [height, setHeight] = useState(72); // inches
  const [weight, setWeight] = useState(150); // lbs
  const [engine, setEngine] = useState<Matter.Engine | null>(null);
  const [bodies, setBodies] = useState<Record<string, Matter.Body> | null>(null);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [draggedJoint, setDraggedJoint] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [selectedHold, setSelectedHold] = useState("");
  const [holds, setHolds] = useState<Array<{x: number, y: number, type: string, id: string, assignedLimb?: string, grip?: string}>>([]);
  const [climberPlaced, setClimberPlaced] = useState(false);
  const [mode, setMode] = useState("select");
  const [isHoldForceSelectorMode, setIsHoldForceSelectorMode] = useState(false);
  const [selectedAnalysisHoldId, setSelectedAnalysisHoldId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const spawnPosRef = useRef<{x: number, y: number} | null>(null);
  const limbConstraints = useRef<Record<string, Matter.Constraint>>({});
  const snapHoldIndexRef = useRef<number | null>(null);
  const snapRejectedRef = useRef<{ idx: number; until: number } | null>(null);
  const draggedJointRef = useRef<string | null>(null);
  const hoveredHoldIdxRef = useRef<number | null>(null);
  const draggedHoldIdxRef = useRef<number | null>(null);
  const lastMouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

  // Setup Matter.js and stickman
  useEffect(() => {
    if (!canvasRef.current || !climberPlaced) return;
    // Clean up previous engine
    if (engine) {
      Matter.Runner.stop((engine as any).runner as Matter.Runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }
    // Map height slider (48–84in) to 150–220px canvas height (~180px at average)
    const stickmanHeightPx = Math.round(150 + ((height - 48) / 36) * 70);
    const scalePx = stickmanHeightPx / height;
    setScale(scalePx);
    // Stickman proportions in px
    const px = (v: number) => v * height * scalePx;
    // Center stickman
    const cx = spawnPosRef.current ? spawnPosRef.current.x : WALL_WIDTH / 2;
    const cy = spawnPosRef.current ? spawnPosRef.current.y : WALL_HEIGHT * 0.15 + px(STICKMAN_PROPORTIONS.head) / 2;
    // Create engine
    const _engine = Engine.create();
    // Boundary walls (floor + ceiling + left + right)
    const floor   = Bodies.rectangle(WALL_WIDTH / 2, WALL_HEIGHT + 10, WALL_WIDTH + 40, 20, { isStatic: true });
    const ceiling = Bodies.rectangle(WALL_WIDTH / 2, -10,              WALL_WIDTH + 40, 20, { isStatic: true });
    const wallL   = Bodies.rectangle(-10,           WALL_HEIGHT / 2,   20, WALL_HEIGHT + 40, { isStatic: true });
    const wallR   = Bodies.rectangle(WALL_WIDTH + 10, WALL_HEIGHT / 2, 20, WALL_HEIGHT + 40, { isStatic: true });
    // Bodies
    const head = Bodies.circle(cx, cy, px(STICKMAN_PROPORTIONS.head) / 2, { density: 0.001, friction: 0.2 });
    const torso = Bodies.rectangle(cx, cy + px(STICKMAN_PROPORTIONS.head) / 2 + px(STICKMAN_PROPORTIONS.torso) / 2, px(STICKMAN_PROPORTIONS.head) * 0.7, px(STICKMAN_PROPORTIONS.torso), { density: 0.002, friction: 0.2 });
    // Arms
    const leftUpperArm = Bodies.rectangle(cx - px(STICKMAN_PROPORTIONS.head) * 0.7, cy + px(STICKMAN_PROPORTIONS.head) / 2, px(STICKMAN_PROPORTIONS.upperArm), px(STICKMAN_PROPORTIONS.head) * 0.3, { density: 0.001 });
    const leftLowerArm = Bodies.rectangle(leftUpperArm.position.x - px(STICKMAN_PROPORTIONS.upperArm), leftUpperArm.position.y, px(STICKMAN_PROPORTIONS.lowerArm), px(STICKMAN_PROPORTIONS.head) * 0.25, { density: 0.001 });
    const leftHand = Bodies.circle(leftLowerArm.position.x - px(STICKMAN_PROPORTIONS.lowerArm), leftLowerArm.position.y, px(STICKMAN_PROPORTIONS.hand) / 2, { density: 0.001 });
    const rightUpperArm = Bodies.rectangle(cx + px(STICKMAN_PROPORTIONS.head) * 0.7, cy + px(STICKMAN_PROPORTIONS.head) / 2, px(STICKMAN_PROPORTIONS.upperArm), px(STICKMAN_PROPORTIONS.head) * 0.3, { density: 0.001 });
    const rightLowerArm = Bodies.rectangle(rightUpperArm.position.x + px(STICKMAN_PROPORTIONS.upperArm), rightUpperArm.position.y, px(STICKMAN_PROPORTIONS.lowerArm), px(STICKMAN_PROPORTIONS.head) * 0.25, { density: 0.001 });
    const rightHand = Bodies.circle(rightLowerArm.position.x + px(STICKMAN_PROPORTIONS.lowerArm), rightLowerArm.position.y, px(STICKMAN_PROPORTIONS.hand) / 2, { density: 0.001 });
    // Legs
    const leftUpperLeg = Bodies.rectangle(cx - px(STICKMAN_PROPORTIONS.head) * 0.3, torso.position.y + px(STICKMAN_PROPORTIONS.torso) / 2 + px(STICKMAN_PROPORTIONS.upperLeg) / 2, px(STICKMAN_PROPORTIONS.head) * 0.3, px(STICKMAN_PROPORTIONS.upperLeg), { density: 0.002 });
    const leftLowerLeg = Bodies.rectangle(leftUpperLeg.position.x, leftUpperLeg.position.y + px(STICKMAN_PROPORTIONS.upperLeg) / 2 + px(STICKMAN_PROPORTIONS.lowerLeg) / 2, px(STICKMAN_PROPORTIONS.head) * 0.25, px(STICKMAN_PROPORTIONS.lowerLeg), { density: 0.002 });
    const leftFoot = Bodies.circle(leftLowerLeg.position.x, leftLowerLeg.position.y + px(STICKMAN_PROPORTIONS.lowerLeg) / 2 + px(STICKMAN_PROPORTIONS.foot) / 2, px(STICKMAN_PROPORTIONS.foot) / 2, { density: 0.002 });
    const rightUpperLeg = Bodies.rectangle(cx + px(STICKMAN_PROPORTIONS.head) * 0.3, torso.position.y + px(STICKMAN_PROPORTIONS.torso) / 2 + px(STICKMAN_PROPORTIONS.upperLeg) / 2, px(STICKMAN_PROPORTIONS.head) * 0.3, px(STICKMAN_PROPORTIONS.upperLeg), { density: 0.002 });
    const rightLowerLeg = Bodies.rectangle(rightUpperLeg.position.x, rightUpperLeg.position.y + px(STICKMAN_PROPORTIONS.upperLeg) / 2 + px(STICKMAN_PROPORTIONS.lowerLeg) / 2, px(STICKMAN_PROPORTIONS.head) * 0.25, px(STICKMAN_PROPORTIONS.lowerLeg), { density: 0.002 });
    const rightFoot = Bodies.circle(rightLowerLeg.position.x, rightLowerLeg.position.y + px(STICKMAN_PROPORTIONS.lowerLeg) / 2 + px(STICKMAN_PROPORTIONS.foot) / 2, px(STICKMAN_PROPORTIONS.foot) / 2, { density: 0.002 });
    // Pelvis — free by default; anchored only when both feet are on holds
    const pelvis = Bodies.circle(cx, torso.position.y + px(STICKMAN_PROPORTIONS.torso) / 2, px(STICKMAN_PROPORTIONS.head) * 0.35, { density: 0.003 });
    // Constraints (joints)
    const constraints = [
      // Head to torso
      Constraint.create({ bodyA: head, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.head) / 2 }, bodyB: torso, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, stiffness: 0.98 }),
      // Torso to arms
      Constraint.create({ bodyA: torso, pointA: { x: -px(STICKMAN_PROPORTIONS.head) * 0.35, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: leftUpperArm, pointB: { x: px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: torso, pointA: { x: px(STICKMAN_PROPORTIONS.head) * 0.35, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: rightUpperArm, pointB: { x: -px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, stiffness: 0.98 }),
      // Upper to lower arms
      Constraint.create({ bodyA: leftUpperArm, pointA: { x: -px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, bodyB: leftLowerArm, pointB: { x: px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: rightUpperArm, pointA: { x: px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, bodyB: rightLowerArm, pointB: { x: -px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, stiffness: 0.98 }),
      // Lower arms to hands
      Constraint.create({ bodyA: leftLowerArm, pointA: { x: -px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, bodyB: leftHand, pointB: { x: 0, y: 0 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: rightLowerArm, pointA: { x: px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, bodyB: rightHand, pointB: { x: 0, y: 0 }, stiffness: 0.98 }),
      // Torso to pelvis
      Constraint.create({ bodyA: torso, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: pelvis, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.9 }),
      // Pelvis to legs (replaces torso→legs)
      Constraint.create({ bodyA: pelvis, pointA: { x: -px(STICKMAN_PROPORTIONS.head) * 0.18, y: 0 }, bodyB: leftUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: pelvis, pointA: { x: px(STICKMAN_PROPORTIONS.head) * 0.18, y: 0 }, bodyB: rightUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.98 }),
      // Upper to lower legs
      Constraint.create({ bodyA: leftUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: leftLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: rightUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: rightLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.98 }),
      // Lower legs to feet
      Constraint.create({ bodyA: leftLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: leftFoot, pointB: { x: 0, y: 0 }, stiffness: 0.98 }),
      Constraint.create({ bodyA: rightLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: rightFoot, pointB: { x: 0, y: 0 }, stiffness: 0.98 }),
    ];
    // Add all to world
    World.add(_engine.world, [floor, ceiling, wallL, wallR, head, torso, pelvis, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, ...constraints]);
    // Save for drawing
    setBodies({ head, torso, pelvis, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });
    setEngine(_engine);
    // Run engine
    const runner = Matter.Runner.create();
    (_engine as any).runner = runner;
    Matter.Runner.run(runner, _engine);
    // Standing pose: triggered as soon as any body part nears the floor.
    // Smoothly lerps from the ragdoll entry pose to a neutral standing pose with 45° arms.
    const bodyMap: Record<string, Matter.Body> = { head, torso, pelvis, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot };
    const allStickmanBodies = Object.values(bodyMap);
    const footR = px(STICKMAN_PROPORTIONS.foot) / 2;
    const floorSurfaceY = WALL_HEIGHT;
    let isStanding = false;
    let standProgress = 0;
    let entryPos: Record<number, {x: number, y: number}> = {};
    let targetPos: Record<number, {x: number, y: number}> = {};
    Matter.Events.on(_engine, 'afterUpdate', () => {
      const hasConstraints = Object.keys(limbConstraints.current).length > 0;
      const isDragging = !!draggedJointRef.current;
      // Trigger as soon as any body part is within 40px of the floor
      const lowestY = Math.max(...allStickmanBodies.map(b => b.position.y));
      const shouldStand = lowestY >= floorSurfaceY - 40 && !hasConstraints && !isDragging;

      if (!shouldStand && isStanding) {
        isStanding = false;
        standProgress = 0;
        const draggedBodyId = draggedJointRef.current ? bodyMap[JOINT_TO_BODY[draggedJointRef.current]]?.id : null;
        allStickmanBodies.forEach(b => {
          if (b.id !== draggedBodyId) Body.setStatic(b, false);
        });
        return;
      }
      if (!shouldStand) return;

      if (!isStanding) {
        // Entering — freeze all, snapshot entry positions, compute targets
        isStanding = true;
        standProgress = 0;
        allStickmanBodies.forEach(b => {
          Body.setStatic(b, true);
          entryPos[b.id] = { x: b.position.x, y: b.position.y };
        });

        const standCx   = (leftFoot.position.x + rightFoot.position.x) / 2;
        const stanceOff = px(STICKMAN_PROPORTIONS.head) * 0.55;
        const lFootX    = standCx - stanceOff;
        const rFootX    = standCx + stanceOff;
        const footY     = floorSurfaceY - footR;
        const lLegY     = footY   - px(STICKMAN_PROPORTIONS.lowerLeg) / 2;
        const uLegY     = lLegY   - px(STICKMAN_PROPORTIONS.lowerLeg) / 2 - px(STICKMAN_PROPORTIONS.upperLeg) / 2;
        const pelvisY   = uLegY   - px(STICKMAN_PROPORTIONS.upperLeg) / 2;
        const torsoY    = pelvisY - px(STICKMAN_PROPORTIONS.torso) / 2;
        const headY     = torsoY  - px(STICKMAN_PROPORTIONS.torso) / 2 - px(STICKMAN_PROPORTIONS.head) / 2;
        const shoulderY = torsoY  - px(STICKMAN_PROPORTIONS.torso) / 2;
        // Arms 45° down-and-out from shoulder attachment
        const d45   = Math.SQRT1_2;
        const lShoX = standCx - px(STICKMAN_PROPORTIONS.head) * 0.35;
        const rShoX = standCx + px(STICKMAN_PROPORTIONS.head) * 0.35;
        const uA    = px(STICKMAN_PROPORTIONS.upperArm);
        const lA    = px(STICKMAN_PROPORTIONS.lowerArm);

        targetPos = {
          [head.id]:           { x: standCx,                            y: headY },
          [torso.id]:          { x: standCx,                            y: torsoY },
          [pelvis.id]:         { x: standCx,                            y: pelvisY },
          [leftUpperLeg.id]:   { x: lFootX,                             y: uLegY },
          [leftLowerLeg.id]:   { x: lFootX,                             y: lLegY },
          [leftFoot.id]:       { x: lFootX,                             y: footY },
          [rightUpperLeg.id]:  { x: rFootX,                             y: uLegY },
          [rightLowerLeg.id]:  { x: rFootX,                             y: lLegY },
          [rightFoot.id]:      { x: rFootX,                             y: footY },
          [leftUpperArm.id]:   { x: lShoX - (uA / 2) * d45,            y: shoulderY + (uA / 2) * d45 },
          [leftLowerArm.id]:   { x: lShoX - uA * d45 - (lA / 2) * d45, y: shoulderY + uA * d45 + (lA / 2) * d45 },
          [leftHand.id]:       { x: lShoX - (uA + lA) * d45,           y: shoulderY + (uA + lA) * d45 },
          [rightUpperArm.id]:  { x: rShoX + (uA / 2) * d45,            y: shoulderY + (uA / 2) * d45 },
          [rightLowerArm.id]:  { x: rShoX + uA * d45 + (lA / 2) * d45, y: shoulderY + uA * d45 + (lA / 2) * d45 },
          [rightHand.id]:      { x: rShoX + (uA + lA) * d45,           y: shoulderY + (uA + lA) * d45 },
        };
      }

      standProgress = Math.min(1, standProgress + 0.09);
      const t = 1 - Math.pow(1 - standProgress, 3); // ease-out cubic
      allStickmanBodies.forEach(b => {
        const from = entryPos[b.id];
        const to   = targetPos[b.id];
        if (!from || !to) return;
        Body.setPosition(b, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      });
    });
    // Clean up on unmount
    return () => {
      Matter.Runner.stop(runner);
      Matter.World.clear(_engine.world, false);
      Matter.Engine.clear(_engine);
    };
  }, [height, weight, climberPlaced]);

  // Redraw wall, holds, and stickman every frame
  useEffect(() => {
    let animationId: number;
    function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      drawWall(ctx, incline);
      // Draw floor and ceiling borders
      ctx.save();
      ctx.fillStyle = "#B0AFA8";
      ctx.fillRect(0, WALL_HEIGHT - 20, WALL_WIDTH, 20);
      ctx.fillRect(0, 0, WALL_WIDTH, 20);
      ctx.restore();
      // Draw holds
      holds.forEach(hold => drawHold(ctx, hold));
      // Draw selected analysis hold halo
      if (selectedAnalysisHoldId && isHoldForceSelectorMode) {
        const selectedHold = holds.find(h => h.id === selectedAnalysisHoldId);
        if (selectedHold) {
          ctx.save();
          ctx.strokeStyle = "#FF6B35";
          ctx.lineWidth = 4;
          ctx.shadowColor = "#FF6B35";
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(selectedHold.x, selectedHold.y, 40, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
      }
      // Place/move mode: hover and drag indicators
      const hovHoldIdx = hoveredHoldIdxRef.current;
      const drgHoldIdx = draggedHoldIdxRef.current;
      if (drgHoldIdx !== null && holds[drgHoldIdx]) {
        const h = holds[drgHoldIdx];
        ctx.save();
        ctx.strokeStyle = "#FF6B35";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#FF6B35";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 28, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      } else if (hovHoldIdx !== null && holds[hovHoldIdx]) {
        const h = holds[hovHoldIdx];
        ctx.save();
        ctx.strokeStyle = "#FF6B35";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(h.x, h.y, 28, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }
      // Snap highlight ring
      const snapIdx = snapHoldIndexRef.current;
      if (snapIdx !== null && holds[snapIdx]) {
        const h = holds[snapIdx];
        ctx.save();
        ctx.strokeStyle = "#FF6B35";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#FF6B35";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 26, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }
      // Rejected snap flash (hand tried to grab smear)
      if (snapRejectedRef.current) {
        const { idx, until } = snapRejectedRef.current;
        if (Date.now() < until && holds[idx]) {
          ctx.save();
          ctx.strokeStyle = "#EF4444";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#EF4444";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(holds[idx].x, holds[idx].y, 22, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        } else {
          snapRejectedRef.current = null;
        }
      }
      // Stuck-limb connection lines
      if (bodies) {
        Object.entries(limbConstraints.current).forEach(([jointName, c]) => {
          const bk = JOINT_TO_BODY[jointName];
          if (!bk || !bodies[bk]) return;
          const lp = bodies[bk].position;
          ctx.save();
          ctx.strokeStyle = "#FF6B35";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(lp.x, lp.y);
          ctx.lineTo(c.pointB.x, c.pointB.y);
          ctx.stroke();
          ctx.restore();
        });
      }
      // Draw stickman if placed
      if (climberPlaced && bodies) {
        drawStickman(ctx, bodies, hoveredJoint, draggedJoint, bodies.pelvis?.isStatic ?? false);
      } else if (!climberPlaced) {
        // Placeholder prompt
        ctx.save();
        ctx.font = "600 1.2rem Inter, Arial, sans-serif";
        ctx.fillStyle = "#B0AFA8";
        ctx.textAlign = "center";
        ctx.fillText("Drag the climber from the sidebar onto the wall", WALL_WIDTH / 2, WALL_HEIGHT / 2);
        ctx.restore();
      }
      animationId = requestAnimationFrame(render);
    }
    render();
    return () => cancelAnimationFrame(animationId);
  }, [bodies, incline, hoveredJoint, draggedJoint, scale, holds, climberPlaced, selectedAnalysisHoldId, isHoldForceSelectorMode]);

  // Mouse interaction for joints and holds
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    function getJointAt(x: number, y: number) {
      if (!bodies) return null;
      const joints = getStickmanJoints(bodies) as Record<string, {x: number, y: number}>;
      const groups = [
        { keys: ["leftHand", "rightHand", "leftFoot", "rightFoot"], r: 12 },
        { keys: ["pelvis"], r: 12 },
        { keys: ["leftShoulder", "leftElbow", "rightShoulder", "rightElbow", "leftHip", "leftKnee", "rightHip", "rightKnee"], r: 10 },
        { keys: ["head", "neck", "torso"], r: 15 },
      ];
      for (const { keys, r } of groups) {
        for (const joint of keys) {
          const pos = joints[joint];
          if (!pos) continue;
          const dx = x - pos.x, dy = y - pos.y;
          if (dx * dx + dy * dy < r * r * scale * scale) return joint;
        }
      }
      return null;
    }
    function getHoldAt(x: number, y: number) {
      for (let i = holds.length - 1; i >= 0; i--) {
        const hold = holds[i];
        if (Math.hypot(x - hold.x, y - hold.y) < 32) return i;
      }
      return null;
    }
    function updatePelvisAnchor() {
      if (!bodies?.pelvis) return;
      const shouldAnchor = !!limbConstraints.current["leftFoot"] && !!limbConstraints.current["rightFoot"];
      Body.setStatic(bodies.pelvis, shouldAnchor);
    }
    let dragging = false;
    let dragJoint: string | null = null;
    let offset = { x: 0, y: 0 };
    function onMouseMove(e: any) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      lastMouseRef.current = { x, y };
      // Hold drag uses the ref so it survives effect re-runs caused by setHolds
      if (draggedHoldIdxRef.current !== null) {
        const idx = draggedHoldIdxRef.current;
        setHolds(hs => hs.map((h, i) => {
          if (i !== idx) return h;
          if (h.assignedLimb && limbConstraints.current[h.assignedLimb]) {
            (limbConstraints.current[h.assignedLimb] as any).pointB = { x, y };
          }
          return { ...h, x, y };
        }));
        return;
      }
      // Hover detection for place mode
      if (mode === "place") {
        const idx = getHoldAt(x, y);
        hoveredHoldIdxRef.current = idx;
      } else {
        hoveredHoldIdxRef.current = null;
      }
      if (dragging && dragJoint && climberPlaced) {
        const bodyKey = JOINT_TO_BODY[dragJoint];
        if (!bodyKey || !bodies || !bodies[bodyKey]) return;
        const MARGIN = 20; // match border thickness
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        if (dragJoint === "pelvis") {
          let dx = (x - offset.x) - bodies.pelvis.position.x;
          let dy = (y - offset.y) - bodies.pelvis.position.y;
          // Clamp delta so no body leaves the wall
          Object.values(bodies).forEach(b => {
            const nx = b.position.x + dx, ny = b.position.y + dy;
            if (nx < MARGIN)              dx = Math.max(dx, MARGIN - b.position.x);
            if (nx > WALL_WIDTH - MARGIN) dx = Math.min(dx, WALL_WIDTH - MARGIN - b.position.x);
            if (ny < MARGIN)              dy = Math.max(dy, MARGIN - b.position.y);
            if (ny > WALL_HEIGHT - MARGIN) dy = Math.min(dy, WALL_HEIGHT - MARGIN - b.position.y);
          });
          // Clamp pelvis delta so constrained limbs can't stretch beyond anatomical reach from their hold
          const spx2 = (v: number) => v * height * scale;
          const maxFromPelvis: Record<string, number> = {
            leftFoot:  spx2(STICKMAN_PROPORTIONS.upperLeg + STICKMAN_PROPORTIONS.lowerLeg + STICKMAN_PROPORTIONS.foot / 2) * 2.2,
            rightFoot: spx2(STICKMAN_PROPORTIONS.upperLeg + STICKMAN_PROPORTIONS.lowerLeg + STICKMAN_PROPORTIONS.foot / 2) * 2.2,
            leftHand:  spx2(STICKMAN_PROPORTIONS.torso + STICKMAN_PROPORTIONS.upperArm + STICKMAN_PROPORTIONS.lowerArm + STICKMAN_PROPORTIONS.hand / 2) * 2.2,
            rightHand: spx2(STICKMAN_PROPORTIONS.torso + STICKMAN_PROPORTIONS.upperArm + STICKMAN_PROPORTIONS.lowerArm + STICKMAN_PROPORTIONS.hand / 2) * 2.2,
          };
          Object.entries(limbConstraints.current).forEach(([joint, c]) => {
            const maxDist = maxFromPelvis[joint];
            if (!maxDist || !c.pointB) return;
            const hx = c.pointB.x, hy = c.pointB.y;
            const npx = bodies.pelvis.position.x + dx;
            const npy = bodies.pelvis.position.y + dy;
            const dist = Math.hypot(npx - hx, npy - hy);
            if (dist > maxDist) {
              const angle = Math.atan2(npy - hy, npx - hx);
              dx = hx + Math.cos(angle) * maxDist - bodies.pelvis.position.x;
              dy = hy + Math.sin(angle) * maxDist - bodies.pelvis.position.y;
            }
          });
          Object.values(bodies).forEach(b => Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy }));
        } else {
          let tx = clamp(x - offset.x, MARGIN, WALL_WIDTH - MARGIN);
          let ty = clamp(y - offset.y, MARGIN, WALL_HEIGHT - MARGIN);
          // Clamp limb endpoints to their max anatomical reach from the anchor joint
          const spx = (v: number) => v * height * scale;
          const maxArm  = spx(STICKMAN_PROPORTIONS.upperArm + STICKMAN_PROPORTIONS.lowerArm + STICKMAN_PROPORTIONS.hand) * 0.95;
          const maxLeg  = spx(STICKMAN_PROPORTIONS.upperLeg + STICKMAN_PROPORTIONS.lowerLeg + STICKMAN_PROPORTIONS.foot) * 0.95;
          const reachMap: Record<string, { anchor: string; max: number }> = {
            leftHand:  { anchor: "leftUpperArm",  max: maxArm },
            rightHand: { anchor: "rightUpperArm", max: maxArm },
            leftFoot:  { anchor: "leftUpperLeg",  max: maxLeg },
            rightFoot: { anchor: "rightUpperLeg", max: maxLeg },
          };
          const reach = reachMap[dragJoint];
          if (reach && bodies[reach.anchor]) {
            const ax = bodies[reach.anchor].position.x;
            const ay = bodies[reach.anchor].position.y;
            const ddx = tx - ax, ddy = ty - ay;
            const dist = Math.hypot(ddx, ddy);
            if (dist > reach.max) {
              tx = ax + (ddx / dist) * reach.max;
              ty = ay + (ddy / dist) * reach.max;
            }
          }
          Body.setPosition(bodies[bodyKey], { x: tx, y: ty });
        }
        if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(dragJoint)) {
          const lp = bodies[bodyKey].position;
          let bestIdx = null, bestDist = 40;
          holds.forEach((hold, idx) => {
            const d = Math.hypot(lp.x - hold.x, lp.y - hold.y);
            if (d < bestDist) { bestDist = d; bestIdx = idx; }
          });
          snapHoldIndexRef.current = bestIdx;
        }
      } else if (climberPlaced) {
        snapHoldIndexRef.current = null;
        setHoveredJoint(getJointAt(x, y));
      }
    }
    function onMouseDown(e: any) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      // Right click: delete hold
      if (e.button === 2) {
        const idx = getHoldAt(x, y);
        if (idx !== null) {
          setHolds(hs => hs.filter((_, i) => i !== idx));
          return;
        }
      }
      // Hold force selector mode: select a hold for analysis
      if (isHoldForceSelectorMode && e.button === 0) {
        const idx = getHoldAt(x, y);
        if (idx !== null) {
          setSelectedAnalysisHoldId(holds[idx].id);
          return;
        }
      }
      // Place/move holds in place mode
      if (mode === "place" && e.button === 0 && !isHoldForceSelectorMode) {
        const existingIdx = getHoldAt(x, y);
        if (existingIdx !== null) {
          draggedHoldIdxRef.current = existingIdx;
          hoveredHoldIdxRef.current = null;
          return;
        }
        if (selectedHold) {
          const gx = Math.round((x - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
          const gy = Math.round((y - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
          const holdId = `hold-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          setHolds(hs => [...hs, { x: gx, y: gy, type: selectedHold, id: holdId, grip: "intended" }]);
        }
        return;
      }
      // Drag joint
      if (climberPlaced && bodies) {
        const joint = getJointAt(x, y);
        if (joint) {
          const bodyKey = JOINT_TO_BODY[joint];
          if (!bodyKey || !bodies[bodyKey]) return;
          // Release existing limb constraint before dragging
          if (limbConstraints.current[joint] && engine) {
            World.remove(engine.world, limbConstraints.current[joint]);
            delete limbConstraints.current[joint];
            setHolds(hs => hs.map(h => h.assignedLimb === joint ? { ...h, assignedLimb: undefined } : h));
            updatePelvisAnchor();
          }
          dragging = true;
          dragJoint = joint;
          setDraggedJoint(joint);
          draggedJointRef.current = joint;
          Body.setStatic(bodies[bodyKey], true);
          const pos = bodies[bodyKey].position;
          offset = { x: x - pos.x, y: y - pos.y };
        }
      }
    }
    function onMouseUp() {
      if (dragging && dragJoint && bodies && engine) {
        const bodyKey = JOINT_TO_BODY[dragJoint];
        if (bodyKey && bodies[bodyKey]) {
          const limbBody = bodies[bodyKey];
          if (dragJoint === "pelvis") {
            updatePelvisAnchor();
          } else {
            Body.setStatic(limbBody, false);
            if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(dragJoint)) {
              let bestIdx = -1, bestDist = 40;
              holds.forEach((hold, idx) => {
                const d = Math.hypot(limbBody.position.x - hold.x, limbBody.position.y - hold.y);
                if (d < bestDist) { bestDist = d; bestIdx = idx; }
              });
              if (bestIdx >= 0) {
                const hold = holds[bestIdx];
                const isHand = dragJoint === "leftHand" || dragJoint === "rightHand";
                if (hold.type === "smear" && isHand) {
                  snapRejectedRef.current = { idx: bestIdx, until: Date.now() + 400 };
                } else {
                  Body.setPosition(limbBody, { x: hold.x, y: hold.y });
                  const c = Constraint.create({ bodyA: limbBody, pointB: { x: hold.x, y: hold.y }, length: 0, stiffness: 1.0, damping: 0.1 });
                  World.add(engine.world, c);
                  limbConstraints.current[dragJoint] = c;
                  setHolds(hs => hs.map((h, i) => i === bestIdx ? { ...h, assignedLimb: dragJoint! } : h));
                  updatePelvisAnchor();
                }
              }
            }
          }
        }
      }
      snapHoldIndexRef.current = null;
      if (draggedHoldIdxRef.current !== null) {
        const mx = lastMouseRef.current.x, my = lastMouseRef.current.y;
        const gx = Math.round((mx - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        const gy = Math.round((my - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        const idx = draggedHoldIdxRef.current;
        setHolds(hs => hs.map((h, i) => {
          if (i !== idx) return h;
          if (h.assignedLimb && limbConstraints.current[h.assignedLimb]) {
            (limbConstraints.current[h.assignedLimb] as any).pointB = { x: gx, y: gy };
          }
          return { ...h, x: gx, y: gy };
        }));
      }
      draggedHoldIdxRef.current = null;
      hoveredHoldIdxRef.current = null;
      dragging = false;
      dragJoint = null;
      setDraggedJoint(null);
      draggedJointRef.current = null;
    }
    function onContextMenu(e: any) {
      e.preventDefault();
    }
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("touchstart", onMouseDown);
    canvas.addEventListener("touchmove", onMouseMove);
    canvas.addEventListener("touchend", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("touchstart", onMouseDown);
      canvas.removeEventListener("touchmove", onMouseMove);
      canvas.removeEventListener("touchend", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [bodies, scale, selectedHold, holds, climberPlaced, mode, engine, isHoldForceSelectorMode]);

  function formatHeight(inches: number) {
    const ft = Math.floor(inches / 12);
    const inch = inches % 12;
    return `${ft}ft ${inch}in`;
  }

  return (
    <div className="flex h-[100vh] w-full bg-[#F8F8F8] font-sans text-[#171717] select-none">
      {/* Left Sidebar */}
      <aside className="w-[280px] h-full bg-white border-r border-[#E5E7EB] flex flex-col px-6 py-8">
        <div className="mb-6">
          <h1 className="font-bold text-2xl tracking-tight text-[#171717]">CruxMan</h1>
          <div className="text-xs text-gray-500 font-medium mt-1">Climbing Force Analyzer</div>
        </div>
        {/* Mode Toggle */}
        <div className="mb-6">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Mode</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={"flex-1 py-1.5 text-xs font-semibold rounded transition " + (mode === "select" ? "bg-[#FF6B35] text-white" : "bg-white text-[#171717] border border-gray-300 hover:border-[#FF6B35]")}
              onClick={() => { setMode("select"); setSelectedHold(""); }}
            >Select</button>
            <button
              type="button"
              className={"flex-1 py-1.5 text-xs font-semibold rounded transition " + (mode === "place" ? "bg-[#FF6B35] text-white" : "bg-white text-[#171717] border border-gray-300 hover:border-[#FF6B35]")}
              onClick={() => setMode("place")}
            >Place/Move Holds</button>
          </div>
        </div>
        <div className="mb-6">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Wall Incline</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={45}
              max={90}
              value={incline}
              onChange={e => setIncline(Number(e.target.value))}
              className="accent-[#FF6B35] w-full h-2"
            />
            <span className="text-sm font-mono w-10 text-right">{incline}&deg;</span>
          </div>
        </div>
        <div className="mb-6">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Climber Height</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={48}
              max={84}
              value={height}
              onChange={e => setHeight(Number(e.target.value))}
              className="accent-[#FF6B35] w-full h-2"
            />
            <span className="text-sm font-mono w-16 text-right">{formatHeight(height)}</span>
          </div>
        </div>
        <div className="mb-6">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Climber Weight</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={80}
              max={300}
              value={weight}
              onChange={e => setWeight(Number(e.target.value))}
              className="accent-[#FF6B35] w-full h-2"
            />
            <span className="text-sm font-mono w-14 text-right">{weight}lb</span>
          </div>
        </div>
        {/* Holds Section */}
        <div className="mb-6">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Holds</div>
          <div className="grid grid-cols-2 gap-2">
            {HOLD_TYPES.map(ht => (
              <button
                key={ht.key}
                className={
                  (selectedHold === ht.key
                    ? "bg-[#FF6B35] text-white border-[#FF6B35]"
                    : "bg-white text-[#171717] border border-gray-300 hover:border-[#FF6B35]") +
                  " flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold transition"
                }
                onClick={() => { setSelectedHold(ht.key); setMode("place"); }}
                type="button"
              >
                <span style={{ display: "inline-block", width: 18, height: 18 }}>
                  <svg width={18} height={18}>
                    {/* Icon preview for each hold type */}
                    {(() => {
                      switch (ht.key) {
                        case "jug":
                          return <path d="M3,9 Q9,2 15,9 Q9,16 3,9 Z" fill={ht.color} />;
                        case "crimp":
                          return <rect x={3} y={7} width={12} height={4} rx={1} fill={ht.color} />;
                        case "sloper":
                          return <ellipse cx={9} cy={9} rx={8} ry={5} fill={ht.color} />;
                        case "pinch":
                          return <ellipse cx={9} cy={9} rx={3} ry={8} fill={ht.color} />;
                        case "pocket":
                          return <g><circle cx={9} cy={9} r={7} fill={ht.color} /><circle cx={9} cy={9} r={3} fill="#fff" /></g>;
                        case "sidepull":
                          return <path d="M9,2 Q16,9 9,16 Q2,9 9,2 Z" fill={ht.color} transform="rotate(-30 9 9)" />;
                        case "foothold":
                          return <rect x={5} y={5} width={8} height={8} fill={ht.color} />;
                        case "undercling":
                          return <path d="M3,9 Q9,16 15,9 Q9,2 3,9 Z" fill={ht.color} />;
                        case "hueco":
                          return <circle cx={9} cy={9} r={8} fill="none" stroke={ht.color} strokeWidth={3} />;
                        case "rail":
                          return <rect x={2} y={7} width={14} height={4} rx={2} fill={ht.color} />;
                        case "smear":
                          return <rect x={4} y={4} width={10} height={10} rx={2} fill="none" stroke={ht.color} strokeWidth={1.5} strokeDasharray="2 2" />;
                        default:
                          return null;
                      }
                    })()}
                  </svg>
                </span>
                {ht.name}
              </button>
            ))}
          </div>
        </div>
        {/* Draggable stickman */}
        <div className="mb-4">
          <div className="uppercase text-[11px] tracking-widest text-gray-400 font-semibold mb-2">Climber</div>
          <div
            draggable={!climberPlaced}
            onDragStart={e => e.dataTransfer.setData("text/plain", "stickman")}
            title={climberPlaced ? "Climber already on wall" : "Drag onto wall"}
            className={"inline-flex flex-col items-center gap-1 " + (climberPlaced ? "opacity-40 cursor-not-allowed" : "cursor-grab hover:opacity-70")}
          >
            <svg width="44" height="62" viewBox="0 0 44 62">
              <circle cx="22" cy="9" r="8" fill="#1A1A1A"/>
              <line x1="22" y1="17" x2="22" y2="38" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round"/>
              <line x1="8" y1="25" x2="36" y2="25" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round"/>
              <line x1="22" y1="38" x2="10" y2="56" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round"/>
              <line x1="22" y1="38" x2="34" y2="56" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="text-[10px] text-gray-400">drag to wall</span>
          </div>
        </div>
        <div className="flex-1" />
      </aside>

      {/* Main Wall Area */}
      <main className="flex-1 flex items-center justify-center relative h-full">
        <div
            className="relative"
            style={{ width: WALL_WIDTH, height: WALL_HEIGHT }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (climberPlaced) return;
              const rect = canvasRef.current!.getBoundingClientRect();
              spawnPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              setClimberPlaced(true);
            }}
          >
          {/* Wall shadow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow:
                "0 24px 48px -8px rgba(0,0,0,0.18)", // Stronger shadow only at the bottom
              borderRadius: 8,
            }}
          />
          <canvas
            ref={canvasRef}
            width={WALL_WIDTH}
            height={WALL_HEIGHT}
            className="block w-full h-full rounded"
            style={{ background: WALL_BG, borderRadius: 8, cursor: mode === "place" ? "crosshair" : "default" }}
          />
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="w-[300px] h-full bg-white border-l border-[#E5E7EB] flex flex-col px-6 py-8">
        <h2 className="font-bold text-xl mb-6">Force Analysis</h2>

        {/* Hold Force Selector Toggle */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              setIsHoldForceSelectorMode(!isHoldForceSelectorMode);
              if (!isHoldForceSelectorMode) {
                setSelectedAnalysisHoldId(null);
                setAnalysisResult(null);
              }
            }}
            className={
              isHoldForceSelectorMode
                ? "w-full py-2 px-3 rounded font-semibold text-sm transition bg-[#FF6B35] text-white"
                : "w-full py-2 px-3 rounded font-semibold text-sm transition bg-white text-[#171717] border border-gray-300 hover:border-[#FF6B35]"
            }
          >
            🎯 Hold Force Selector
          </button>
          {isHoldForceSelectorMode && (
            <p className="text-xs text-gray-500 mt-2">Click a hold on the wall to select it for analysis</p>
          )}
        </div>

        {/* Selected Hold Info & Run Analysis Button */}
        {isHoldForceSelectorMode && selectedAnalysisHoldId && (
          <div className="mb-6 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs font-semibold text-gray-600 mb-2">Selected Hold</p>
            <p className="text-sm font-mono text-[#FF6B35]">{selectedAnalysisHoldId}</p>
            <button
              type="button"
              onClick={async () => {
                if (!selectedAnalysisHoldId || !bodies) return;
                setIsAnalyzing(true);
                try {
                  const joints = getStickmanJoints(bodies);
                  const response = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      wallIncline: incline,
                      climberHeight: height,
                      climberWeight: weight,
                      joints,
                      holds,
                      selectedAnalysisHoldId,
                    }),
                  });
                  const data = await response.json();
                  if (response.ok) {
                    setAnalysisResult(data);
                    // Fire-and-forget log to Snowflake in the background (don't await)
                    fetch("/api/log", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        wallIncline: incline,
                        climberHeight: height,
                        climberWeight: weight,
                        selectedHoldId: selectedAnalysisHoldId,
                        analysis: data,
                      }),
                    }).catch(() => {});
                  } else {
                    alert(`Error: ${data.error}`);
                    setAnalysisResult(null);
                  }
                } catch (err) {
                  alert("Failed to run analysis");
                  setAnalysisResult(null);
                } finally {
                  setIsAnalyzing(false);
                }
              }}
              disabled={isAnalyzing}
              className="w-full mt-3 py-2 px-3 rounded font-semibold text-sm transition bg-[#FF6B35] text-white hover:opacity-90 disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "RUN ANALYSIS"}
            </button>
          </div>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs font-semibold text-gray-600 mb-1">Total Force on Hold</p>
              <p className="text-lg font-bold text-[#FF6B35]">
                {(analysisResult.holdTotalLbs ?? 0).toFixed(1)} lbs
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(analysisResult.holdPercentageOfBodyWeight ?? 0).toFixed(1)}% of body weight
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">Muscles Used</p>
              <div className="space-y-2">
                {analysisResult.musclesUsed?.map((muscle: any, i: number) => (
                  <div key={i} className="p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-gray-700 capitalize">{muscle.name}</span>
                      <span className="text-xs font-mono text-[#FF6B35]">{(muscle.lbs ?? 0).toFixed(1)} lbs</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded h-1.5">
                      <div
                        className="bg-[#FF6B35] h-1.5 rounded transition-all"
                        style={{ width: `${Math.min(muscle.percentage ?? 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{(muscle.percentage ?? 0).toFixed(1)}% activation</p>
                  </div>
                ))}
              </div>
            </div>

            {analysisResult.biomechanicalBreakdown && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">Biomechanical Breakdown</p>
                <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded border border-gray-200">
                  {analysisResult.biomechanicalBreakdown}
                </p>
              </div>
            )}
          </div>
        )}

        {!isHoldForceSelectorMode && !analysisResult && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-gray-400 text-center text-sm">Enable Hold Force Selector to analyze specific holds</span>
          </div>
        )}
      </aside>
    </div>
  );
}
