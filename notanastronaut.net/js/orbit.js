const wrapper = document.querySelector('#orbWrapper');
const root = document.querySelector('#orbDiv');
const canvas = document.querySelector('#orbCanvas');
const ctx = canvas.getContext('2d');
const div = document.querySelector('#orb');
const showConstruction = document.querySelector('input');

//wrapper.style.top = '100px';
//wrapper.style.right = '600px';
root.style.position = 'absolute';
root.style.top = '0px';
root.style.right = '780px';

const pointRadius = 5;
let dragging = 'none';

function getVars() {
  const rootStyle = window.getComputedStyle(root);
  const divStyle = window.getComputedStyle(div);
  const vars = {};
  for (let i = 0; i < 4; ++i) {
    for (const xy of ['x', 'y']) {
      const varName = 'p' + i.toString() + xy;
      vars[varName] = parseInt(rootStyle.getPropertyValue('--' + varName));
    }
  }
  for (let i = 1; i < 7; ++i) {
    for (const xy of ['x', 'y']) {
      const varName = 'q' + i.toString() + xy;
      vars[varName] = parseInt(divStyle.getPropertyValue('--' + varName));
    }
  }
  vars.progress =  parseInt(divStyle.getPropertyValue('z-index')) / 1000;
  return vars;
}

function drawPoint(x, y, fillStyle) {
 ctx.save();
 ctx.fillStyle = fillStyle;
 ctx.beginPath();
 ctx.arc(x, y, pointRadius, 0, 2 * Math.PI);
 ctx.fill();
 ctx.restore();
}

// function drawControlPoint(x, y) {
//  ctx.save();
//  ctx.strokeStyle = 'black';
//  ctx.lineWidth = 2;
//  ctx.fillStyle = 'white';
//  ctx.beginPath();
//  ctx.rect(x - pointRadius, y - pointRadius, pointRadius * 2, pointRadius * 2);
//  ctx.stroke();
//  ctx.fill();
//  ctx.restore();
// }

// function drawLine(x1, y1, x2, y2, strokeStyle) {
//  ctx.save();
//  ctx.strokeStyle = strokeStyle;
//  ctx.beginPath();
//  ctx.moveTo(x1, y1);
//  ctx.lineTo(x2, y2);
//  ctx.stroke();
//  ctx.restore();
// }

// function drawBezier(vars) {
//  ctx.save();
//  ctx.strokeStyle = 'red';
//  ctx.lineWidth = 2;
//  ctx.beginPath();
//  ctx.moveTo(vars.p0x, vars.p0y);
//  ctx.bezierCurveTo(vars.p1x, vars.p1y, vars.p2x, vars.p2y, vars.p3x, vars.p3y);
//  console.log('p0x: ' + vars.p0x + ', p0y: ' + vars.p0y +', p1x: ' + vars.p1x + ', p1y: ' + vars.p1y + ', p2x: ' + vars.p2x + ', p2y: ' + vars.p2y + ', p3x: ' + vars.p3x + ', p3y: ' + vars.p3y);
//  ctx.stroke();
//  ctx.restore();
// }

// function redraw() {
//   ctx.clearRect(0, 0, canvas.width, canvas.height);
  
//   const vars = getVars(); 
  
//   // drawLine(vars.p0x, vars.p0y, vars.p1x, vars.p1y, '#777');
//   // drawLine(vars.p2x, vars.p2y, vars.p3x, vars.p3y, '#777');

  
//   if (showConstruction.checked) {
//     drawLine(vars.p1x, vars.p1y, vars.p2x, vars.p2y, '#007');
//     drawLine(vars.q1x, vars.q1y, vars.q2x, vars.q2y, '#007');
//     drawLine(vars.q2x, vars.q2y, vars.q3x, vars.q3y, '#007');
//     drawLine(vars.q4x, vars.q4y, vars.q5x, vars.q5y, '#007');
//     for(let i = 1; i < 7; ++i) {
//      drawPoint(vars['q' + i + 'x'], vars['q' + i + 'y'], '#777');
//     }
//   }
  
//   drawBezier(vars);
//   drawPoint(vars.p0x, vars.p0y, 'black');
//   drawPoint(vars.p3x, vars.p3y, 'black');
//   drawControlPoint(vars.p1x, vars.p1y);
//   drawControlPoint(vars.p2x, vars.p2y);
  
//   window.requestAnimationFrame(redraw);
// }

// redraw();

function getMousePositionWithinCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function canDrag(x, y, x1, y1) {
  return Math.max(Math.abs(x - x1), Math.abs(y - y1)) < pointRadius;
}

canvas.addEventListener('mousedown', (e) => {
  const [mouseX, mouseY] = getMousePositionWithinCanvas(e);
  
  dragging = 'none';
  const vars = getVars();
  for(let i = 0; i < 4; ++i) {
    const pName = 'p' + i.toString();
    if (canDrag(mouseX, mouseY, vars[pName + 'x'], vars[pName + 'y'])) {
      dragging = pName;
      break;
    }
  }
});

canvas.addEventListener('mouseup', (e) => {
  dragging = 'none';
});

canvas.addEventListener('mousemove', (e) => {
  if (dragging === 'none') {
    return;
  }
  
  const [mouseX, mouseY] = getMousePositionWithinCanvas(e);
  root.style.setProperty('--' + dragging + 'x', mouseX);
  root.style.setProperty('--' + dragging + 'y', mouseY);
});