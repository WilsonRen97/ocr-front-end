import * as d3 from "d3";

function drawFamilyTreeGraph(container, treeData) {
  if (!container || !treeData) return;

  const width = 1200; // bigger drawing surface
  const height = 900; // bigger height
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };

  container.innerHTML = "";

  // High-resolution SVG (scales infinitely)
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`) // allows zoom-quality rendering
    .style("border", "1px solid #eee");

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Build tree
  const root = d3.hierarchy(treeData);
  const treeLayout = d3.tree().size([innerWidth, innerHeight - 100]);
  treeLayout(root);

  // Parent–child links
  g.selectAll("line.link")
    .data(root.links())
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y)
    .attr("stroke", "#ccc")
    .attr("stroke-width", 2);

  // ⭐ Sibling links → removed entirely
  // (No dotted lines, no lines at all)

  // Nodes
  g.selectAll("circle")
    .data(root.descendants())
    .enter()
    .append("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", 18)
    .attr("fill", "#69b3a2");

  // Text labels (smaller + non-overflow)
  g.selectAll("text")
    .data(root.descendants())
    .enter()
    .append("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y + 4)
    .attr("text-anchor", "middle")
    .attr("font-size", "15px")
    .text((d) => d.data.name);
}

export default drawFamilyTreeGraph;
