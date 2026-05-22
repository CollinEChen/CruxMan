
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

const STICKMAN_COLOR = "#2D2D2D";
const JOINT_COLOR = "#FFF";
const JOINT_BORDER = "#2D2D2D";
const JOINT_RADIUS = 8;
const JOINT_RADIUS_ACTIVE = 12;
const HAND_FOOT_RADIUS = 11;
const HAND_FOOT_RADIUS_ACTIVE = 15;
const HOVER_GLOW = "#FF6B35";

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
    leftHip: bodies.leftUpperLeg.position,
    leftKnee: bodies.leftLowerLeg.position,
    leftFoot: bodies.leftFoot.position,
    rightHip: bodies.rightUpperLeg.position,
    rightKnee: bodies.rightLowerLeg.position,
    rightFoot: bodies.rightFoot.position,
  };
}

function drawStickman(ctx, bodies, hoveredJoint, draggedJoint, scale) {
  const joints = getStickmanJoints(bodies);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Draw limbs (lines between joints)
  ctx.strokeStyle = STICKMAN_COLOR;
  ctx.lineWidth = 8 * scale;
  // Arms
  ctx.beginPath();
  ctx.moveTo(joints.leftShoulder.x, joints.leftShoulder.y);
  ctx.lineTo(joints.leftElbow.x, joints.leftElbow.y);
  ctx.lineTo(joints.leftHand.x, joints.leftHand.y);
  ctx.moveTo(joints.rightShoulder.x, joints.rightShoulder.y);
  ctx.lineTo(joints.rightElbow.x, joints.rightElbow.y);
  ctx.lineTo(joints.rightHand.x, joints.rightHand.y);
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
  // Torso
  ctx.beginPath();
  ctx.moveTo(joints.neck.x, joints.neck.y);
  ctx.lineTo(joints.leftHip.x, joints.leftHip.y);
  ctx.moveTo(joints.neck.x, joints.neck.y);
  ctx.lineTo(joints.rightHip.x, joints.rightHip.y);
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.arc(joints.head.x, joints.head.y, (STICKMAN_PROPORTIONS.head * scale * 0.5), 0, 2 * Math.PI);
  ctx.fillStyle = STICKMAN_COLOR;
  ctx.fill();
  // Joints
  Object.entries(joints).forEach(([joint, pos]) => {
    let r = JOINT_RADIUS * scale;
    if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(joint)) r = HAND_FOOT_RADIUS * scale;
    if (hoveredJoint === joint) r = HAND_FOOT_RADIUS_ACTIVE * scale;
    if (draggedJoint === joint) {
      ctx.save();
      ctx.shadowColor = HOVER_GLOW;
      ctx.shadowBlur = 16 * scale;
      ctx.fillStyle = HOVER_GLOW;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = JOINT_COLOR;
    ctx.strokeStyle = JOINT_BORDER;
    ctx.lineWidth = 3 * scale;
    ctx.fill();
    ctx.stroke();
    if (hoveredJoint === joint && draggedJoint !== joint) {
      ctx.save();
      ctx.shadowColor = HOVER_GLOW;
      ctx.shadowBlur = 12 * scale;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.strokeStyle = HOVER_GLOW;
      ctx.lineWidth = 4 * scale;
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.restore();
}

export default function Home() {
  const canvasRef = useRef(null);
  const [incline, setIncline] = useState(75);
  const [height, setHeight] = useState(72); // inches
  const [weight, setWeight] = useState(150); // lbs
  const [engine, setEngine] = useState(null);
  const [bodies, setBodies] = useState(null);
  const [hoveredJoint, setHoveredJoint] = useState(null);
  const [draggedJoint, setDraggedJoint] = useState(null);
  const [scale, setScale] = useState(1);
  const [selectedHold, setSelectedHold] = useState("jug");
  const [holds, setHolds] = useState([]);

  // Setup Matter.js and stickman
  useEffect(() => {
    if (!canvasRef.current) return;
    // Clean up previous engine
    if (engine) {
      Matter.Runner.stop(engine.runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }
    // Calculate scale for stickman
    const stickmanHeightPx = WALL_HEIGHT * 0.7;
    const scalePx = stickmanHeightPx / height;
    setScale(scalePx);
    // Stickman proportions in px
    const px = v => v * height * scalePx;
    // Center stickman
    const cx = WALL_WIDTH / 2;
    const cy = WALL_HEIGHT * 0.15 + px(STICKMAN_PROPORTIONS.head) / 2;
    // Create engine
    const _engine = Engine.create();
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
      // Torso to legs
      Constraint.create({ bodyA: torso, pointA: { x: -px(STICKMAN_PROPORTIONS.head) * 0.18, y: px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: leftUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: torso, pointA: { x: px(STICKMAN_PROPORTIONS.head) * 0.18, y: px(STICKMAN_PROPORTIONS.torso) / 2 }, bodyB: rightUpperLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, stiffness: 0.7 }),
      // Upper to lower legs
      Constraint.create({ bodyA: leftUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: leftLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightUpperLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.upperLeg) / 2 }, bodyB: rightLowerLeg, pointB: { x: 0, y: -px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, stiffness: 0.7 }),
      // Lower legs to feet
      Constraint.create({ bodyA: leftLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: leftFoot, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
      Constraint.create({ bodyA: rightLowerLeg, pointA: { x: 0, y: px(STICKMAN_PROPORTIONS.lowerLeg) / 2 }, bodyB: rightFoot, pointB: { x: 0, y: 0 }, stiffness: 0.7 }),
    ];
    // Add all to world
    World.add(_engine.world, [head, torso, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, ...constraints]);
    // Save for drawing
    setBodies({ head, torso, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });
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
  }, [height, weight]);

  // Redraw wall, holds, and stickman every frame
  useEffect(() => {
    let animationId;
    function render() {
      const canvas = canvasRef.current;
      if (!canvas || !bodies) return;
      const ctx = canvas.getContext("2d");
      drawWall(ctx, incline);
      // Draw holds
      holds.forEach(hold => drawHold(ctx, hold));
      drawStickman(ctx, bodies, hoveredJoint, draggedJoint, scale);
      animationId = requestAnimationFrame(render);
    }
    render();
    return () => cancelAnimationFrame(animationId);
  }, [bodies, incline, hoveredJoint, draggedJoint, scale, holds]);

  // Mouse interaction for joints and holds
  useEffect(() => {
    if (!canvasRef.current || !bodies) return;
    const canvas = canvasRef.current;
    function getJointAt(x, y) {
      const joints = getStickmanJoints(bodies);
      for (const [joint, pos] of Object.entries(joints)) {
        let r = JOINT_RADIUS * scale;
        if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(joint)) r = HAND_FOOT_RADIUS * scale;
        const dx = x - pos.x;
        const dy = y - pos.y;
        if (dx * dx + dy * dy < r * r * 1.2) return joint;
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
    let dragJoint = null;
    let offset = { x: 0, y: 0 };
    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      if (dragging && dragJoint) {
        // Move joint body
        const body = bodies[dragJoint];
        Body.setPosition(body, { x: x - offset.x, y: y - offset.y });
      } else {
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
      // Place hold if a hold type is selected and not clicking a joint
      if (selectedHold && !getJointAt(x, y) && e.button === 0) {
        // Snap to nearest grid dot
        const gx = Math.round((x - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        const gy = Math.round((y - HOLE_SPACING / 2) / HOLE_SPACING) * HOLE_SPACING + HOLE_SPACING / 2;
        setHolds(hs => [...hs, { x: gx, y: gy, type: selectedHold }]);
        return;
      }
      // Drag joint
      const joint = getJointAt(x, y);
      if (joint) {
        dragging = true;
        dragJoint = joint;
        setDraggedJoint(joint);
        const pos = bodies[joint].position;
        offset = { x: x - pos.x, y: y - pos.y };
      }
    }
    function onMouseUp() {
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
  }, [bodies, scale, selectedHold, holds]);

  function formatHeight(inches) {
    const ft = Math.floor(inches / 12);
    const inch = inches % 12;
    return `${ft}ft ${inch}in`;
  }

  return (
    <div className="flex h-[100vh] w-full bg-[#F8F8F8] font-sans text-[#171717] select-none">
      {/* Left Sidebar */}
      <aside className="w-[280px] h-full bg-white border-r border-[#E5E7EB] flex flex-col px-6 py-8">
        <div className="mb-8">
          <h1 className="font-bold text-2xl tracking-tight text-[#171717]">BetaForge</h1>
          <div className="text-xs text-gray-500 font-medium mt-1">Climbing Force Analyzer</div>
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
        <div className="flex-1" />
      </aside>

      {/* Main Wall Area */}
      <main className="flex-1 flex items-center justify-center relative h-full">
        <div className="relative" style={{ width: WALL_WIDTH, height: WALL_HEIGHT }}>
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
            style={{ background: WALL_BG, borderRadius: 8, cursor: selectedHold ? "crosshair" : "default" }}
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
