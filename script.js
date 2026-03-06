// =====================================================================
// STATE
// =====================================================================
const svg = document.getElementById('mapSVG');
const layerStreets = document.getElementById('layer-streets');
const layerStreetLabels = document.getElementById('layer-street-labels');
const layerSymbols = document.getElementById('layer-symbols');
const layerArrows = document.getElementById('layer-arrows');
const layerLabels = document.getElementById('layer-labels');

let mode = 'select';
let selected = null;
let dragging = false;
let startX, startY, origTx, origTy;
let selectedRotation = 0; // degrees

// Street drawing state
let drawingStreet = false;
let streetStart = null;
let previewLine = null;

// =====================================================================
// MODE
// =====================================================================
const hints = {
  select: '✦ Seleccionar: arrastra para mover | doble clic en texto para editar | con un elemento seleccionado usa ↺ ↻ para rotar',
  street: '🛣 Dibujar calle: clic y arrastra para trazar | suelta para confirmar | se pedirá el nombre',
  arrow:  '➤ Flecha: clic en el mapa para colocar | selecciona y usa ↺ ↻ para rotar',
  add:    '＋ Símbolo: clic en el mapa para colocar el símbolo seleccionado',
  label:  '🏷 Etiqueta: clic en el mapa para agregar texto libre',
};

function setMode(m) {
  mode = m;
  deselect();
  ['select','street','arrow','add','label'].forEach(id => {
    const b = document.getElementById('btn-'+id);
    if (b) b.classList.toggle('active', id === m);
  });
  svg.className.baseVal = 'mode-'+m;
  document.getElementById('hintText').textContent = hints[m] || '';
}

// =====================================================================
// SVG COORDINATES
// =====================================================================
function svgPt(e) {
  const pt = svg.createSVGPoint();
  // Touch support
  const src = e.touches ? e.touches[0] : e;
  pt.x = src.clientX; pt.y = src.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// =====================================================================
// TRANSFORM HELPERS
// =====================================================================
function getTransform(el) {
  const t = el.getAttribute('transform') || '';
  const tMatch = t.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
  const rMatch = t.match(/rotate\(([-\d.]+)\)/);
  return {
    tx: tMatch ? parseFloat(tMatch[1]) : 0,
    ty: tMatch ? parseFloat(tMatch[2]) : 0,
    rot: rMatch ? parseFloat(rMatch[1]) : 0
  };
}

function setTransform(el, tx, ty, rot) {
  el.setAttribute('transform', `translate(${tx},${ty}) rotate(${rot})`);
}

// =====================================================================
// SELECTION
// =====================================================================
function deselect() {
  if (selected) {
    selected.classList.remove('sel-highlight');
    selected = null;
  }
}

function selectElem(el) {
  deselect();
  selected = el;
  el.classList.add('sel-highlight');
  const tf = getTransform(el);
  selectedRotation = tf.rot;
}

// =====================================================================
// DRAG
// =====================================================================
svg.addEventListener('mousedown', onDown);
svg.addEventListener('touchstart', onDown, {passive:false});

function onDown(e) {
  if (e.touches) e.preventDefault();

  const c = svgPt(e);

  // --- STREET DRAWING ---
  if (mode === 'street') {
    drawingStreet = true;
    streetStart = c;
    // Preview line
    previewLine = document.createElementNS('http://www.w3.org/2000/svg','line');
    previewLine.setAttribute('x1', c.x); previewLine.setAttribute('y1', c.y);
    previewLine.setAttribute('x2', c.x); previewLine.setAttribute('y2', c.y);
    const w = parseInt(document.getElementById('streetWidth').value);
    previewLine.setAttribute('stroke', '#d4c5a0');
    previewLine.setAttribute('stroke-width', w);
    previewLine.setAttribute('stroke-linecap', 'round');
    previewLine.setAttribute('opacity', '0.7');
    previewLine.setAttribute('pointer-events','none');
    layerStreets.appendChild(previewLine);
    return;
  }

  // --- ADD SYMBOL ---
  if (mode === 'add') {
    addSymbol(document.getElementById('addType').value, c.x, c.y);
    setMode('select');
    return;
  }

  // --- ADD ARROW ---
  if (mode === 'arrow') {
    addArrow(c.x, c.y);
    setMode('select');
    return;
  }

  // --- ADD LABEL ---
  if (mode === 'label') {
    const text = prompt('Escribe el texto de la etiqueta:');
    if (text) addFreeLabel(text, c.x, c.y);
    setMode('select');
    return;
  }

  // --- SELECT/DRAG ---
  if (mode === 'select') {
    const g = e.target.closest('.draggable-elem');
    if (!g) { deselect(); return; }
    selectElem(g);
    dragging = true;
    const tf = getTransform(g);
    origTx = tf.tx; origTy = tf.ty;
    startX = c.x; startY = c.y;
    e.preventDefault();
  }
}

window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', onMove, {passive:false});

function onMove(e) {
  if (e.touches) e.preventDefault();
  const c = svgPt(e);

  if (drawingStreet && previewLine) {
    previewLine.setAttribute('x2', c.x);
    previewLine.setAttribute('y2', c.y);
    return;
  }

  if (dragging && selected) {
    const dx = c.x - startX;
    const dy = c.y - startY;
    const tf = getTransform(selected);
    setTransform(selected, origTx+dx, origTy+dy, tf.rot);
  }
}

window.addEventListener('mouseup', onUp);
window.addEventListener('touchend', onUp);

function onUp(e) {
  if (drawingStreet && previewLine && streetStart) {
    const c = svgPt(e.changedTouches ? e.changedTouches[0] : e);
    const ex = parseFloat(previewLine.getAttribute('x2'));
    const ey = parseFloat(previewLine.getAttribute('y2'));
    // Remove preview
    previewLine.remove(); previewLine = null;
    drawingStreet = false;

    const dx = ex - streetStart.x, dy = ey - streetStart.y;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (len < 10) { streetStart=null; return; }

    // Ask name
    const name = prompt('Nombre de la calle (deja vacío para omitir):', '');
    finalizeStreet(streetStart.x, streetStart.y, ex, ey, name || '');
    streetStart = null;
    return;
  }
  dragging = false;
}

// =====================================================================
// STREET CREATION
// =====================================================================
function finalizeStreet(x1, y1, x2, y2, name) {
  const w = parseInt(document.getElementById('streetWidth').value);
  const id = 'street_' + Date.now();

  // Group: road + center line + label
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','draggable-elem street-group');
  g.setAttribute('id', id);
  g.setAttribute('transform','translate(0,0) rotate(0)');

  // Road fill
  const road = document.createElementNS('http://www.w3.org/2000/svg','line');
  road.setAttribute('x1',x1); road.setAttribute('y1',y1);
  road.setAttribute('x2',x2); road.setAttribute('y2',y2);
  road.setAttribute('stroke','#d4c5a0');
  road.setAttribute('stroke-width', w);
  road.setAttribute('stroke-linecap','round');

  // Road edges
  const edge = document.createElementNS('http://www.w3.org/2000/svg','line');
  edge.setAttribute('x1',x1); edge.setAttribute('y1',y1);
  edge.setAttribute('x2',x2); edge.setAttribute('y2',y2);
  edge.setAttribute('stroke','#b8a87e');
  edge.setAttribute('stroke-width', w);
  edge.setAttribute('stroke-linecap','round');
  edge.setAttribute('fill','none');
  edge.setAttribute('stroke-dasharray', w+','+(w*0));
  // Use actual border via two thinner lines offset — simpler: just outline
  edge.setAttribute('stroke-width', w+2);
  edge.setAttribute('opacity','0.3');

  // Center dashes
  const dash = document.createElementNS('http://www.w3.org/2000/svg','line');
  dash.setAttribute('x1',x1); dash.setAttribute('y1',y1);
  dash.setAttribute('x2',x2); dash.setAttribute('y2',y2);
  dash.setAttribute('stroke','#c8b890');
  dash.setAttribute('stroke-width','1');
  dash.setAttribute('stroke-dasharray','8,6');
  dash.setAttribute('stroke-linecap','round');
  dash.setAttribute('opacity','0.6');

  g.appendChild(edge);
  g.appendChild(road);
  g.appendChild(dash);

  // Label in center of street
  if (name) {
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const angle = Math.atan2(y2-y1, x2-x1) * 180/Math.PI;
    // Adjust so text reads left-to-right
    const a = (angle > 90 || angle < -90) ? angle+180 : angle;

    const labelG = document.createElementNS('http://www.w3.org/2000/svg','g');
    labelG.setAttribute('class','draggable-elem street-label');
    labelG.setAttribute('transform',`translate(${mx},${my}) rotate(0)`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
    const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-family',"'Source Sans 3',sans-serif");
    txt.setAttribute('font-size','11');
    txt.setAttribute('font-weight','600');
    txt.setAttribute('fill','#5a3825');
    txt.setAttribute('transform',`rotate(${a})`);
    txt.textContent = name;

    labelG.appendChild(txt);
    layerStreetLabels.appendChild(labelG);
  }

  layerStreets.appendChild(g);
  selectElem(g);
}

// =====================================================================
// ARROW CREATION
// =====================================================================
function addArrow(x, y) {
  const color = document.getElementById('arrowColor').value;
  const colorMap = {
    '#c0392b':'Red','#2c6eb5':'Blue','#2a8a2a':'Green','#e07020':'Orange','#222':'Black'
  };
  const markerName = 'arrow'+colorMap[color];

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','draggable-elem arrow-group');
  g.setAttribute('id','arrow_'+Date.now());
  g.setAttribute('transform',`translate(${x},${y}) rotate(0)`);

  // Arrow body (pointing down by default)
  const shaft = document.createElementNS('http://www.w3.org/2000/svg','line');
  shaft.setAttribute('x1','0'); shaft.setAttribute('y1','-28');
  shaft.setAttribute('x2','0'); shaft.setAttribute('y2','0');
  shaft.setAttribute('stroke', color);
  shaft.setAttribute('stroke-width','7');
  shaft.setAttribute('stroke-linecap','round');

  const head = document.createElementNS('http://www.w3.org/2000/svg','polygon');
  head.setAttribute('points','0,14 -11,-4 11,-4');
  head.setAttribute('fill', color);

  g.appendChild(shaft);
  g.appendChild(head);
  layerArrows.appendChild(g);
  selectElem(g);
  selectedRotation = 0;
}

// =====================================================================
// FREE LABEL
// =====================================================================
function addFreeLabel(text, x, y) {
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','draggable-elem free-label');
  g.setAttribute('id','label_'+Date.now());
  g.setAttribute('transform',`translate(${x},${y}) rotate(0)`);

  const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('rx','3'); bg.setAttribute('ry','3');
  bg.setAttribute('fill','#ffffffcc'); bg.setAttribute('stroke','#c9a882'); bg.setAttribute('stroke-width','1');

  const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
  txt.setAttribute('text-anchor','middle');
  txt.setAttribute('font-family',"'Source Sans 3',sans-serif");
  txt.setAttribute('font-size','12');
  txt.setAttribute('font-weight','600');
  txt.setAttribute('fill','#3d2410');
  txt.setAttribute('y','0');
  txt.textContent = text;

  g.appendChild(bg);
  g.appendChild(txt);
  layerLabels.appendChild(g);

  // Fit bg after adding to DOM
  setTimeout(() => {
    try {
      const bb = txt.getBBox();
      bg.setAttribute('x', bb.x-4); bg.setAttribute('y', bb.y-3);
      bg.setAttribute('width', bb.width+8); bg.setAttribute('height', bb.height+6);
    } catch(e){}
  }, 50);

  selectElem(g);
}

// =====================================================================
// SYMBOLS
// =====================================================================
const SHAPES = {
  habitada:`<rect x="-14" y="6" width="28" height="18" fill="#3a7bbf" rx="1"/><polygon points="0,-9 -16,7 16,7" fill="#2a5a9f"/><rect x="-5" y="11" width="10" height="13" fill="#1a3a7f"/><rect x="-12" y="8" width="6" height="6" fill="#aad0ff" stroke="#2a5a9f" stroke-width="0.5"/><text x="0" y="3" text-anchor="middle" font-size="5.5" fill="white" font-weight="bold" font-family="sans-serif">M</text>`,
  abandonada:`<rect x="-14" y="6" width="28" height="18" fill="#aaa" rx="1"/><polygon points="0,-9 -16,7 16,7" fill="#888"/><rect x="-5" y="11" width="10" height="13" fill="#666"/><rect x="-12" y="8" width="6" height="6" fill="#ddd" stroke="#888" stroke-width="0.5"/>`,
  riesgo:`<rect x="-14" y="6" width="28" height="18" fill="#cc2222" rx="1"/><polygon points="0,-9 -16,7 16,7" fill="#991111"/><rect x="-5" y="11" width="10" height="13" fill="#771111"/><rect x="-12" y="8" width="6" height="6" fill="#ffaaaa" stroke="#991111" stroke-width="0.5"/>`,
  construccion:`<rect x="-14" y="6" width="28" height="18" fill="white" stroke="#555" stroke-width="1" rx="1"/><polygon points="0,-9 -16,7 16,7" fill="none" stroke="#555" stroke-width="1"/><rect x="-5" y="11" width="10" height="13" fill="white" stroke="#555" stroke-width="0.7"/><line x1="-14" y1="6" x2="14" y2="24" stroke="#bbb" stroke-width="0.8"/><line x1="14" y1="6" x2="-14" y2="24" stroke="#bbb" stroke-width="0.8"/>`,
  arbol:`<ellipse cx="0" cy="-14" rx="19" ry="16" fill="#228b22"/><ellipse cx="0" cy="-18" rx="13" ry="11" fill="#33aa33"/><ellipse cx="-8" cy="-10" rx="8" ry="7" fill="#1a7a1a"/><rect x="-4" y="2" width="8" height="14" fill="#8b6914"/>`,
  sembradio:`<rect x="-28" y="-20" width="56" height="40" fill="#4a7c2f" rx="3"/><rect x="-28" y="-20" width="19" height="20" fill="#5a9438"/><rect x="-9" y="-20" width="18" height="20" fill="#3d6a25"/><rect x="9" y="-20" width="19" height="20" fill="#5a9438"/><rect x="-28" y="0" width="19" height="20" fill="#3d6a25"/><rect x="-9" y="0" width="18" height="20" fill="#5a9438"/><rect x="9" y="0" width="19" height="20" fill="#3d6a25"/>`,
  puente:`<rect x="-20" y="2" width="40" height="7" fill="#c8a060" rx="1"/><path d="M-18,2 Q-5,-10 0,2" fill="none" stroke="#a07840" stroke-width="2.5"/><path d="M0,2 Q5,-10 18,2" fill="none" stroke="#a07840" stroke-width="2.5"/><rect x="-20" y="9" width="40" height="5" fill="#8b6914"/><line x1="-20" y1="2" x2="-20" y2="14" stroke="#7a5810" stroke-width="2.5"/><line x1="20" y1="2" x2="20" y2="14" stroke="#7a5810" stroke-width="2.5"/>`,
  negocio:`<rect x="-16" y="6" width="32" height="20" fill="#d4a017" rx="1"/><polygon points="0,-11 -19,7 19,7" fill="#b8880a"/><rect x="-7" y="14" width="14" height="12" fill="#8a6005"/><text x="0" y="22" text-anchor="middle" font-size="7" fill="white" font-weight="bold" font-family="sans-serif">$</text>`,
  ganado:`<ellipse cx="0" cy="4" rx="14" ry="9" fill="#111"/><ellipse cx="9" cy="-1" rx="7" ry="5" fill="#222"/><rect x="-10" y="11" width="4" height="7" fill="#111"/><rect x="-4" y="11" width="4" height="7" fill="#111"/><rect x="4" y="11" width="4" height="7" fill="#111"/><rect x="10" y="11" width="4" height="7" fill="#111"/><line x1="14" y1="-3" x2="12" y2="-9" stroke="#222" stroke-width="1.5"/><line x1="16" y1="-3" x2="18" y2="-9" stroke="#222" stroke-width="1.5"/>`,
  escuela:`<rect x="-15" y="6" width="30" height="20" fill="#5aaa5a" rx="1"/><polygon points="0,-10 -17,7 17,7" fill="#3a8a3a"/><rect x="-6" y="14" width="12" height="12" fill="#2a6a2a"/><rect x="-13" y="8" width="6" height="6" fill="#aaffaa" stroke="#3a8a3a" stroke-width="0.5"/><rect x="7" y="8" width="6" height="6" fill="#aaffaa" stroke="#3a8a3a" stroke-width="0.5"/>`,
  pozo:`<rect x="-12" y="5" width="24" height="16" fill="#c8b890" rx="1" stroke="#8b7040" stroke-width="1"/><rect x="-15" y="2" width="30" height="5" fill="#a09060" rx="1"/><line x1="0" y1="-12" x2="0" y2="2" stroke="#888" stroke-width="1.5"/><line x1="-14" y1="-6" x2="14" y2="-6" stroke="#888" stroke-width="1.5"/><line x1="-14" y1="-6" x2="-14" y2="2" stroke="#888" stroke-width="1.5"/><line x1="14" y1="-6" x2="14" y2="2" stroke="#888" stroke-width="1.5"/><ellipse cx="0" cy="11" rx="8" ry="5" fill="#7ab8d8" stroke="#5a9ab8" stroke-width="0.7"/>`,
  bardeado:`<rect x="-25" y="-18" width="50" height="36" fill="#e8dfc0" stroke="#a09060" stroke-width="2" stroke-dasharray="4,2" rx="2"/><rect x="-25" y="-18" width="6" height="36" fill="#a09060"/><rect x="19" y="-18" width="6" height="36" fill="#a09060"/><rect x="-25" y="-18" width="50" height="6" fill="#a09060"/>`,
  cecacvi:`<rect x="-32" y="-8" width="64" height="42" fill="#ffe066" rx="3" stroke="#c8a000" stroke-width="1.5"/><text x="0" y="10" text-anchor="middle" font-size="9" fill="#b8000a" font-weight="900" font-family="serif" letter-spacing="0.5">CECACVI</text><text x="0" y="24" text-anchor="middle" font-size="8" fill="#b8000a" font-weight="700" font-family="serif">BUAP</text>`,
  gobierno:`<rect x="-22" y="0" width="44" height="22" fill="#c8c8d8" rx="1"/><rect x="-16" y="-6" width="32" height="7" fill="#a8a8c0"/><rect x="-10" y="-12" width="20" height="7" fill="#9090b0"/><rect x="-18" y="4" width="7" height="9" fill="#8888a8"/><rect x="-4" y="4" width="8" height="13" fill="#7070a0"/><rect x="11" y="4" width="7" height="9" fill="#8888a8"/><line x1="-22" y1="22" x2="22" y2="22" stroke="#7070a0" stroke-width="1.5"/>`
};

function addSymbol(type, x, y) {
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','draggable-elem symbol-group');
  g.setAttribute('id',type+'_'+Date.now());
  g.setAttribute('transform',`translate(${x},${y}) rotate(0)`);
  g.innerHTML = SHAPES[type] || SHAPES.habitada;
  layerSymbols.appendChild(g);
  selectElem(g);
}

// =====================================================================
// ROTATE
// =====================================================================
function rotateSelected(delta) {
  if (!selected) return;
  const tf = getTransform(selected);
  const newRot = tf.rot + delta;
  setTransform(selected, tf.tx, tf.ty, newRot);
}

// =====================================================================
// DELETE
// =====================================================================
function deleteSelected() {
  if (selected) { selected.remove(); selected = null; }
}

function clearAll() {
  if (!confirm('¿Eliminar todos los elementos del mapa?')) return;
  [layerStreets, layerStreetLabels, layerSymbols, layerArrows, layerLabels].forEach(l => {
    while (l.firstChild) l.removeChild(l.firstChild);
  });
  deselect();
}

// =====================================================================
// DOUBLE CLICK → EDIT TEXT
// =====================================================================
svg.addEventListener('dblclick', e => {
  const txt = e.target;
  if (txt.tagName !== 'text') return;
  const val = prompt('Editar texto:', txt.textContent);
  if (val !== null) {
    txt.textContent = val;
    // Refit bg if it's a free label
    const parent = txt.parentElement;
    if (parent && parent.classList.contains('free-label')) {
      const bg = parent.querySelector('rect');
      if (bg) {
        try {
          const bb = txt.getBBox();
          bg.setAttribute('x', bb.x-4); bg.setAttribute('y', bb.y-3);
          bg.setAttribute('width', bb.width+8); bg.setAttribute('height', bb.height+6);
        } catch(er){}
      }
    }
  }
});

// Init
setMode('select');


// =====================================================================
// DOWNLOAD PDF
// =====================================================================
async function downloadPDF() {
  try {
    // Mostrar mensaje de carga
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '⏳ Generando...';
    btn.disabled = true;

    // Deseleccionar elementos para que no aparezcan con highlight
    deselect();

    // Resetear zoom para captura
    const originalViewBox = svg.getAttribute('viewBox');
    svg.setAttribute('viewBox', '0 0 760 660');

    // Crear un canvas temporal para el SVG
    const svgClone = svg.cloneNode(true);
    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Crear imagen del SVG
    const img = new Image();
    img.src = svgUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Crear canvas para el mapa
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 760;
    canvas.height = 660;
    
    // Fondo del canvas
    ctx.fillStyle = '#f9f5ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar SVG en canvas
    ctx.drawImage(img, 0, 0);

    // Capturar la leyenda
    const legend = document.querySelector('.legend');
    const legendCanvas = await html2canvas(legend, {
      backgroundColor: '#fdfaf4',
      scale: 2
    });

    // Crear PDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Dimensiones A4 landscape: 297mm x 210mm
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 10;

    // Agregar título
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text('CECACVI-BUAP', pageWidth / 2, margin, { align: 'center' });
    
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'normal');
    pdf.text('Santa Ana Coatepec — Editor de Croquis', pageWidth / 2, margin + 7, { align: 'center' });

    // Calcular dimensiones del mapa
    const mapStartY = margin + 15;
    const availableHeight = pageHeight - mapStartY - margin;
    const availableWidth = pageWidth - margin * 2 - 50; // Dejar espacio para leyenda

    // Agregar mapa
    const mapAspectRatio = canvas.width / canvas.height;
    let mapWidth = availableWidth;
    let mapHeight = mapWidth / mapAspectRatio;

    if (mapHeight > availableHeight) {
      mapHeight = availableHeight;
      mapWidth = mapHeight * mapAspectRatio;
    }

    const mapX = margin;
    const mapY = mapStartY;

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      mapX,
      mapY,
      mapWidth,
      mapHeight
    );

    // Agregar leyenda al lado derecho
    const legendX = mapX + mapWidth + 5;
    const legendWidth = pageWidth - legendX - margin;
    const legendHeight = (legendCanvas.height / legendCanvas.width) * legendWidth;

    pdf.addImage(
      legendCanvas.toDataURL('image/png'),
      'PNG',
      legendX,
      mapY,
      legendWidth,
      Math.min(legendHeight, availableHeight)
    );

    // Agregar fecha
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    const fecha = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    pdf.text(`Generado: ${fecha}`, margin, pageHeight - 5);

    // Descargar PDF
    pdf.save(`croquis_${Date.now()}.pdf`);

    // Limpiar
    URL.revokeObjectURL(svgUrl);
    svg.setAttribute('viewBox', originalViewBox);

    // Restaurar botón
    btn.textContent = originalText;
    btn.disabled = false;

  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('Error al generar el PDF. Por favor, intenta de nuevo.');
    if (event && event.target) {
      event.target.textContent = '📥 Descargar PDF';
      event.target.disabled = false;
    }
  }
}
