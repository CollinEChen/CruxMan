
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
];

function drawHold(ctx, hold, scale = 1) {
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

function drawWall(ctx, incline) {
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
function getStickmanJoints(bodies) {
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

function drawStickman(ctx, bodies, hoveredJoint, draggedJoint) {
  const joints = getStickmanJoints(bodies);
  const headR = Math.min(20, bodies.head.circleRadius);

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
        ctx.strokeStyle = isActive ? HOVER_GLOW : "#D1D5DB";
        ctx.lineWidth = 2;
        if (isActive) { ctx.shadowColor = HOVER_GLOW; ctx.shadowBlur = 8; }
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
  const [hoveredJoint, setHoveredJoint] = useState(null);
  const [draggedJoint, setDraggedJoint] = useState(null);
  const [scale, setScale] = useState(1);
  const [selectedHold, setSelectedHold] = useState("jug");
  const [holds, setHolds] = useState<Array<{x: number, y: number, type: string, assignedLimb?: string}>>([]);
  const [climberPlaced, setClimberPlaced] = useState(false);
  const [mode, setMode] = useState("select");
  const spawnPosRef = useRef<{x: number, y: number} | null>(null);
  const limbConstraints = useRef<Record<string, Matter.Constraint>>({});
  const snapHoldIndexRef = useRef<number | null>(null);

  // Setup Matter.js and stickman
  useEffect(() => {
    if (!canvasRef.current || !climberPlaced) return;
    // Clean up previous engine
    if (engine) {
      Matter.Runner.stop((engine as any).runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }
    // Map height slider (48–84in) to 150–220px canvas height (~180px at average)
    const stickmanHeightPx = Math.round(150 + ((height - 48) / 36) * 70);
    const scalePx = stickmanHeightPx / height;
    setScale(scalePx);
    // Stickman proportions in px
    const px = v => v * height * scalePx;
    // Center stickman
    const cx = spawnPosRef.current ? spawnPosRef.current.x : WALL_WIDTH / 2;
    const cy = spawnPosRef.current ? spawnPosRef.current.y : WALL_HEIGHT * 0.15 + px(STICKMAN_PROPORTIONS.head) / 2;
    // Create engine
    const _engine = Engine.create();
    // Add floor
    const floor = Bodies.rectangle(WALL_WIDTH / 2, WALL_HEIGHT - 10, WALL_WIDTH, 20, { isStatic: true, render: { fillStyle: "#B0AFA8" } });
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
    // Pelvis — static anchor at bottom of torso
    const pelvis = Bodies.circle(cx, torso.position.y + px(STICKMAN_PROPORTIONS.torso) / 2, px(STICKMAN_PROPORTIONS.head) * 0.35, { isStatic: true, density: 0.003 });
    // Constraints (joints)
    const constraints = [
      // Head to torso
      Constraint.create({ bodyA: head, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.head) / 2 }, bodyB: torso, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, stiffness: 0.7 }),
      // Torso to arms
      Constraint.create({ bodyA: torso, pointA: { x: -px(STICKMAN_PROPORTIONS.head) * 0.35, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: leftUpperArm, pointB: { x: px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: torso, pointA: { x: px(STICKMAN_PROPORTIONS.head) * 0.35, y: -px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: rightUpperArm, pointB: { x: -px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, stiffness: 0.7 }),
      // Upper to lower arms
      Constraint.create({ bodyA: leftUpperArm, pointA: { x: -px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, bodyB: leftLowerArm, pointB: { x: px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightUpperArm, pointA: { x: px(STICKMAN_PROPORTIONS.upperArm) / 2, y: 0 }, bodyB: rightLowerArm, pointB: { x: -px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, stiffness: 0.7 }),
      // Lower arms to hands
      Constraint.create({ bodyA: leftLowerArm, pointA: { x: -px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, bodyB: leftHand, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightLowerArm, pointA: { x: px(STICKMAN_PROPORTIONS.lowerArm) / 2, y: 0 }, bodyB: rightHand, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
      // Torso to pelvis
      Constraint.create({ bodyA: torso, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: pelvis, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.9 }),
      // Pelvis to legs (replaces torso→legs)
      Constraint.create({ bodyA: pelvis, pointA: { x: -px(STICKMAN_PROPORTIONS.head) * 0.18, y: 0 }, bodyB: leftUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: pelvis, pointA: { x: px(STICKMAN_PROPORTIONS.head) * 0.18, y: 0 }, bodyB: rightUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.7 }),
      // Upper to lower legs
      Constraint.create({ bodyA: leftUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: leftLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: rightLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.7 }),
      // Lower legs to feet
      Constraint.create({ bodyA: leftLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: leftFoot, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: rightFoot, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
    ];
    // Add all to world
    World.add(_engine.world, [floor, head, torso, pelvis, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, ...constraints]);
    // Save for drawing
    setBodies({ head, torso, pelvis, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });
    setEngine(_engine);
    // Run engine
    const runner = Matter.Runner.create();
    _engine.runner = runner;
    Matter.Runner.run(runner, _engine);
    // Clean up on unmount
    return () => {
      Matter.Runner.stop(runner);
      Matter.World.clear(_engine.world, false);
      Matter.Engine.clear(_engine);
    };
  }, [height, weight, climberPlaced]);

  // Redraw wall, holds, and stickman every frame
  useEffect(() => {
    let animationId;
    function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      drawWall(ctx, incline);
      // Draw floor
      ctx.save();
      ctx.fillStyle = "#B0AFA8";
      ctx.fillRect(0, WALL_HEIGHT - 20, WALL_WIDTH, 20);
      ctx.restore();
      // Draw holds
      holds.forEach(hold => drawHold(ctx, hold));
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
        drawStickman(ctx, bodies, hoveredJoint, draggedJoint);
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
  }, [bodies, incline, hoveredJoint, draggedJoint, scale, holds, climberPlaced]);

  // Mouse interaction for joints and holds
  useEffect(() => {
    if (!canvasRef.current || (!bodies && !climberPlaced)) return;
    const canvas = canvasRef.current;
    function getJointAt(x, y) {
      if (!bodies) return null;
      const joints = getStickmanJoints(bodies) as Record<string, {x: number, y: number}>;
      const groups = [
        { keys: ["leftHand", "rightHand", "leftFoot", "rightFoot"], r: 25 },
        { keys: ["pelvis"], r: 20 },
        { keys: ["leftShoulder", "leftElbow", "rightShoulder", "rightElbow", "leftHip", "leftKnee", "rightHip", "rightKnee"], r: 12 },
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
    function getHoldAt(x, y) {
      for (let i = holds.length - 1; i >= 0; i--) {
        const hold = holds[i];
        // Use a bounding box for hit test
        if (Math.abs(x - hold.x) < 20 && Math.abs(y - hold.y) < 20) return i;
      }
      return null;
    }
    let dragging = false;
    let dragJoint: string | null = null;
    let offset = { x: 0, y: 0 };
    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      if (dragging && dragJoint && climberPlaced) {
        const bodyKey = JOINT_TO_BODY[dragJoint];
        if (!bodyKey || !bodies || !bodies[bodyKey]) return;
        if (dragJoint === "pelvis") {
          const dx = (x - offset.x) - bodies.pelvis.position.x;
          const dy = (y - offset.y) - bodies.pelvis.position.y;
          Object.entries(bodies).forEach(([, b]) => Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy }));
        } else {
          Body.setPosition(bodies[bodyKey], { x: x - offset.x, y: y - offset.y });
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
    function onMouseDown(e) {
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
      // Place hold only in place mode
      if (mode === "place" && selectedHold && e.button === 0) {
        const gx = Math.round((x - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        const gy = Math.round((y - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        setHolds(hs => [...hs, { x: gx, y: gy, type: selectedHold }]);
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
          }
          dragging = true;
          dragJoint = joint;
          setDraggedJoint(joint);
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
          Body.setStatic(limbBody, dragJoint === "pelvis");
          if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(dragJoint)) {
            let bestIdx = -1, bestDist = 40;
            holds.forEach((hold, idx) => {
              const d = Math.hypot(limbBody.position.x - hold.x, limbBody.position.y - hold.y);
              if (d < bestDist) { bestDist = d; bestIdx = idx; }
            });
            if (bestIdx >= 0) {
              const hold = holds[bestIdx];
              Body.setPosition(limbBody, { x: hold.x, y: hold.y });
              const c = Constraint.create({ bodyA: limbBody, pointB: { x: hold.x, y: hold.y }, length: 0, stiffness: 1.0, damping: 0.1 });
              World.add(engine.world, c);
              limbConstraints.current[dragJoint] = c;
              setHolds(hs => hs.map((h, i) => i === bestIdx ? { ...h, assignedLimb: dragJoint! } : h));
            }
          }
        }
      }
      snapHoldIndexRef.current = null;
      dragging = false;
      dragJoint = null;
      setDraggedJoint(null);
    }
    function onContextMenu(e) {
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
  }, [bodies, scale, selectedHold, holds, climberPlaced, mode, engine]);

  function formatHeight(inches) {
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
              onClick={() => setMode("select")}
            >Select</button>
            <button
              type="button"
              className={"flex-1 py-1.5 text-xs font-semibold rounded transition " + (mode === "place" ? "bg-[#FF6B35] text-white" : "bg-white text-[#171717] border border-gray-300 hover:border-[#FF6B35]")}
              onClick={() => setMode("place")}
            >Place Hold</button>
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
                onClick={() => setSelectedHold(ht.key)}
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
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-400 text-center">Position the climber and click Analyze</span>
        </div>
      </aside>
    </div>
  );
}
