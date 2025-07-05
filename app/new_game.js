document.getElementById('new-game-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  // Convert numeric fields from string to number
  data.systemCount = parseInt(data.systemCount, 10);
  data.connectionCount = parseInt(data.connectionCount, 10);
  data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

  // Send data to main process to create the universe
  window.api.send('create-universe', data);

  // Do NOT close the window here
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.close();
});

// Listen for the generated universe and render with D3
window.api.receive('universe-created', (payload) => {
  const universe = payload.universe;
  renderUniverseDiagram(universe);
  displayStellarObjectCounts(universe);
  displayColorKey(universe);
});

function renderUniverseDiagram(universe) {
  const width = document.getElementById('universe-diagram').clientWidth || 800;
  const height = document.getElementById('universe-diagram').clientHeight || 400;

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
    sys.connections.forEach(connId => {
      const key = [Math.min(sys.id, connId), Math.max(sys.id, connId)].join('-');
      linkSet.add(key);
    });
  });
  const links = Array.from(linkSet).map(key => {
    const [source, target] = key.split('-').map(Number);
    return { source, target };
  });

  // Clear previous diagram
  d3.select("#universe-diagram").selectAll("*").remove();

  // Add SVG and group for zooming
  const svg = d3.select("#universe-diagram")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const container = svg.append("g");

  // Add zoom behavior
  svg.call(
    d3.zoom()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      })
  );

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(50))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = container.append("g")
    .attr("stroke", "#aaa")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1.5);

  const node = container.append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 8)
    .attr("fill", d => d.type ? color(d.type) : "#888")
    .call(drag(simulation));

  const label = container.append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("dy", -12)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .attr("font-size", 10)
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

function displayStellarObjectCounts(universe) {
  // Remove any previous summary
  let summaryDiv = document.getElementById('stellar-object-summary');
  if (!summaryDiv) {
    summaryDiv = document.createElement('div');
    summaryDiv.id = 'stellar-object-summary';
    summaryDiv.style.margin = '16px 0';
    summaryDiv.style.color = '#fff';
    document.querySelector('.main-layout').insertBefore(summaryDiv, document.getElementById('universe-diagram'));
  }
  // Get counts
  const counts = universe.stellarObjects.reduce((acc, obj) => {
    acc[obj.type] = (acc[obj.type] || 0) + 1;
    return acc;
  }, {});
  summaryDiv.innerHTML = `<b>Stellar Object Counts:</b><br>` +
    Object.entries(counts).map(([type, count]) => `${type}: ${count}`).join('<br>');
}

function displayColorKey(universe) {
  // Remove any previous key
  let keyDiv = document.getElementById('stellar-object-color-key');
  if (!keyDiv) {
    keyDiv = document.createElement('div');
    keyDiv.id = 'stellar-object-color-key';
    keyDiv.style.margin = '16px 0';
    keyDiv.style.color = '#fff';
    keyDiv.style.fontSize = '0.95em';
    document.querySelector('.main-layout').insertBefore(keyDiv, document.getElementById('universe-diagram'));
  }
  // Get types and colors
  const types = Array.from(new Set(universe.stellarObjects.map(obj => obj.type)));
  const color = d3.scaleOrdinal()
    .domain(types)
    .range(d3.schemeCategory10);

  keyDiv.innerHTML = `<b>System Color Key:</b><br>` +
    types.map(type =>
      `<span style="display:inline-block;width:16px;height:16px;background:${color(type)};margin-right:8px;border-radius:50%;vertical-align:middle;"></span>${type}`
    ).join('<br>');
}
