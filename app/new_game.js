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
});

function renderUniverseDiagram(universe) {
  const width = document.getElementById('universe-diagram').clientWidth || 800;
  const height = document.getElementById('universe-diagram').clientHeight || 400;

  // Prepare nodes and links for D3
  const nodes = universe.systems.map(sys => ({
    id: sys.id,
    name: sys.name
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
    .attr("fill", "#4299e1")
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
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }
}
