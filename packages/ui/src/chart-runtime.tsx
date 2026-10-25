import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core.js';
import {LineChart,BarChart,GraphChart} from 'echarts/charts.js';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,AriaComponent} from 'echarts/components.js';
import {SVGRenderer} from 'echarts/renderers.js';
echarts.use([LineChart,BarChart,GraphChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,AriaComponent,SVGRenderer]);
export default function ChartRuntime({option,label}:{option:any;label:string}){
 const element=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=element.current;if(!node||!node.clientWidth||!node.clientHeight)return;
  const plot=echarts.init(node,undefined,{renderer:'svg'});plot.setOption(option);let disposed=false;
  // Closed details and route transitions can report a zero-sized view. Resizing
  // a graph into that singular coordinate transform is invalid in ECharts.
  const observer=new ResizeObserver(()=>{if(!disposed&&node.isConnected&&node.clientWidth>0&&node.clientHeight>0)plot.resize();});
  observer.observe(node);return()=>{disposed=true;observer.disconnect();plot.dispose();};
 },[option]);
 return <div className="analytical-plot" ref={element} role="img" aria-label={label}/>;
}
