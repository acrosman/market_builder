document.getElementById('new-game-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  // Convert numeric fields from string to number
  data.systemCount = parseInt(data.systemCount, 10);
  data.connectionCount = parseInt(data.connectionCount, 10);
  data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

  // Send data to main process to create the universe
  window.api.send('create-universe', data);

  // Disable the form during document generation.
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.close();
});

// Listen for the generated universe and render with D3
window.api.receive('universe-created', async (payload) => {
  const graph = payload.graph;
  const summary = payload.summary;
  renderUniverseDiagram(graph);
  displayStellarObjectCounts(summary.typeTotals);
  displayColorKey(graph.stellarObjects);

  // Re-enable the generate button for subsequent generations
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.disabled = false;
  generateBtn.textContent = 'Generate Universe';

  // Show and enable the proceed button after universe is generated
  const proceedBtn = document.getElementById('proceed-btn');
  proceedBtn.style.display = 'block';
  proceedBtn.disabled = false;

  // Remove any existing event listeners to avoid duplicates
  const newProceedBtn = proceedBtn.cloneNode(true);
  proceedBtn.parentNode.replaceChild(newProceedBtn, proceedBtn);

  // Add fresh event listener
  newProceedBtn.addEventListener('click', () => {
    window.api.send('proceed-to-player-creation');
  });
});

function renderUniverseDiagram(universe) {
  const diagramElement = document.getElementById('universe-diagram');
  const width = diagramElement.clientWidth || 800;
  const height = diagramElement.clientHeight || 600;

  // Assign a color to each type
  const types = Array.from(new Set(universe.stellarObjects.map(obj => obj.type)));
  const color = d3.scaleOrdinal()
    .domain(types)
    .range(d3.schemeCategory10);

  // Map system id to the most common stellar object type in that system
  const systemType = {};
  universe.systems.forEach(sys => {
    const objs = universe.stellarObjects.filter(obj => obj.location === sys.id);
    if (objs.length > 0) {
      // Use the most common type in this system
      const typeCounts = {};
      objs.forEach(obj => { typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1; });
      systemType[sys.id] = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      systemType[sys.id] = null;
    }
  });

  // Prepare nodes and links for D3
  const nodes = universe.systems.map(sys => ({
    id: sys.id,
    name: sys.name,
    type: systemType[sys.id]
  }));

  // Build unique links (avoid duplicates)
  const linkSet = new Set();
  universe.systems.forEach(sys => {
    Object.keys(sys.connections).forEach(connId => {
      const numConnId = Number(connId);
      const key = [Math.min(sys.id, numConnId), Math.max(sys.id, numConnId)].join('-');
      linkSet.add(key);
    });
  });
  const links = Array.from(linkSet).map(key => {
    const [source, target] = key.split('-').map(Number);
    return { source, target };
  });

  // Clear previous diagram and info
  d3.select("#universe-diagram").selectAll("*").remove();

  // Create container for summary and key
  const infoContainer = d3.select(".universe-view")
    .insert("div", "#universe-diagram")
    .attr("class", "universe-info");

  // Add SVG and group for zooming
  const svg = d3.select("#universe-diagram")
    .append("svg")
    .attr("class", "universe-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const container = svg.append("g");

  // Add zoom behavior with initial transform to fit all nodes
  const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .on("zoom", (event) => {
      container.attr("transform", event.transform);
    });

  svg.call(zoom);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(50))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = container.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "universe-link");

  const node = container.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("class", "universe-node")
    .attr("r", 8)
    .attr("fill", d => d.type ? color(d.type) : "#888")
    .call(drag(simulation));

  const label = container.append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "universe-label")
    .attr("dy", -12)
    .text(d => d.name);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

  // After nodes are created, fit view to show all nodes
  setTimeout(() => {
    const bounds = container.node().getBBox();
    const dx = bounds.width;
    const dy = bounds.height;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;

    const scale = 0.9 / Math.max(dx / width, dy / height);
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    svg.transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity
        .translate(translate[0], translate[1])
        .scale(scale));
  }, 100);

  function drag(simulation) {
    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded);
  }
}

function displayStellarObjectCounts(typeTotals) {
  let summaryDiv = document.getElementById('stellar-object-summary');
  if (!summaryDiv) {
    summaryDiv = document.createElement('div');
    summaryDiv.id = 'stellar-object-summary';
    summaryDiv.className = 'universe-summary';
    document.querySelector('.universe-info').appendChild(summaryDiv);
  }
  summaryDiv.innerHTML = `<b>Stellar Object Counts:</b><br>` +
    Object.entries(typeTotals).map(([type, count]) => `${type}: ${count}`).join('<br>');
}

function displayColorKey(stellarObjects) {
  let keyDiv = document.getElementById('stellar-object-color-key');
  if (!keyDiv) {
    keyDiv = document.createElement('div');
    keyDiv.id = 'stellar-object-color-key';
    keyDiv.className = 'universe-color-key';
    document.querySelector('.universe-info').appendChild(keyDiv);
  }
  const types = Array.from(new Set(stellarObjects.map(obj => obj.type)));
  const color = d3.scaleOrdinal()
    .domain(types)
    .range(d3.schemeCategory10);

  keyDiv.innerHTML = `<b>System Color Key:</b><br>` +
    types.map(type =>
      `<span style="display:inline-block;width:16px;height:16px;background:${color(type)};margin-right:8px;border-radius:50%;vertical-align:middle;"></span>${type}`
    ).join('<br>');
}
