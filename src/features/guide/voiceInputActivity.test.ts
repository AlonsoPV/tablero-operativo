import {describe,expect,it,vi} from 'vitest'
import {classifyInputSamples,createVoiceInputMonitor} from './voiceInputActivity'
describe('monitor acústico local conservador',()=>{
 it('silencio requiere muestras válidas; habla o ruido bloquean cierre',()=>{
   expect(classifyInputSamples(new Float32Array(64))).toBe('silent')
   expect(classifyInputSamples(new Float32Array([0.02,-0.02]))).toBe('active')
   expect(classifyInputSamples(new Float32Array([NaN]))).toBe('unknown')
   expect(classifyInputSamples(new Float32Array())).toBe('unknown')
 })
 it('desconecta nodos, cierra AudioContext y detiene pistas exactamente una vez',()=>{
   const track={readyState:'live',stop:vi.fn()}
   const stream={getTracks:()=>[track],getAudioTracks:()=>[track]}
   const source={connect:vi.fn(),disconnect:vi.fn()}
   const analyser={fftSize:2048,getFloatTimeDomainData:(data:Float32Array)=>data.fill(0),disconnect:vi.fn()}
   const context={state:'running',createMediaStreamSource:()=>source,createAnalyser:()=>analyser,resume:vi.fn(async()=>{}),close:vi.fn(async()=>{})}
   const monitor=createVoiceInputMonitor(stream as never,()=>context as never)
   expect(monitor.read()).toBe('silent')
   context.state='suspended';expect(monitor.read()).toBe('unknown')
   monitor.close();monitor.close()
   expect(track.stop).toHaveBeenCalledTimes(1)
   expect(source.disconnect).toHaveBeenCalledTimes(1)
   expect(analyser.disconnect).toHaveBeenCalledTimes(1)
   expect(context.close).toHaveBeenCalledTimes(1)
   expect(monitor.read()).toBe('unknown')
 })
 it('fallo de monitor no se toma como silencio y se puede liberar la pista',()=>{
   const stop=vi.fn();const stream={getTracks:()=>[{stop}],getAudioTracks:()=>[{readyState:'live'}]}
   const monitor=createVoiceInputMonitor(stream as never,()=>{throw Error('AudioContext unavailable')})
   expect(monitor.read()).toBe('unknown');monitor.close();expect(stop).toHaveBeenCalledOnce()
 })
})
