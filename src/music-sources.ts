/** Provider-whitelisted embedded players; third-party audio is NEVER decoded into DJ Web Audio. */
export type MusicPlatform='SoundCloud'|'YouTube Music'|'Apple Music';
export type MusicSource={platform:MusicPlatform;originalUrl:string;embedUrl:string};
const videoId=/^[a-zA-Z0-9_-]{11}$/;
export function resolveMusicSource(raw:string):MusicSource {
 if(raw.length>2048||raw.trim().length<12)throw Error('Paste a valid public music link.');
 let url:URL;try{url=new URL(raw.trim())}catch{throw Error('Invalid music link.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw Error('Unsupported music link.');
 url.protocol='https:';
 const host=url.hostname.toLowerCase();
 if(['soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(host)){
  const segments=url.pathname.split('/').filter(Boolean);
  if(segments.length<2||segments.some(segment=>!/^[\w-]+$/.test(decodeURIComponent(segment)))||['discover','search','charts','you','stream'].includes(segments[0]!.toLowerCase()))throw Error('Unsupported SoundCloud track or playlist link.');
  const originalUrl='https://soundcloud.com/'+segments.join('/');
  const embed=new URL('https://w.soundcloud.com/player/');
  embed.searchParams.set('url',originalUrl);embed.searchParams.set('auto_play','false');embed.searchParams.set('show_artwork','true');
  return {platform:'SoundCloud',originalUrl,embedUrl:embed.toString()};
 }
 if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(host)){
  const segments=url.pathname.split('/').filter(Boolean);
  const id=host==='youtu.be'?segments[0]:url.pathname==='/watch'?url.searchParams.get('v'):segments[0]==='shorts'||segments[0]==='live'?segments[1]:null;
  if(!id||!videoId.test(id)||url.searchParams.has('list'))throw Error('Unsupported YouTube Music track link.');
  const originalUrl=host==='music.youtube.com'?'https://music.youtube.com/watch?v='+id:'https://www.youtube.com/watch?v='+id;
  return {platform:'YouTube Music',originalUrl,embedUrl:'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1'};
 }
 if(['music.apple.com','www.music.apple.com'].includes(host)){
  const segments=url.pathname.split('/').filter(Boolean),region=segments[0],kind=segments[1];
  if(!region||!/^([a-z]{2})$/.test(region)||!kind||!['album','playlist','song','music-video'].includes(kind)||segments.length<3||segments.some(p=>/[^\w.%-]/.test(p)))throw Error('Unsupported Apple Music link.');
  const item=url.searchParams.get('i');if(item&&!/^\d+$/.test(item))throw Error('Invalid Apple Music link.');
  const query=item?'?i='+item:'',path=segments.join('/');
  return {platform:'Apple Music',originalUrl:'https://music.apple.com/'+path+query,embedUrl:'https://embed.music.apple.com/'+path+query};
 }
 throw Error('Unsupported music link. Use SoundCloud, YouTube Music or Apple Music.');
}
