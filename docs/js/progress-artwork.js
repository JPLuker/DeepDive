// Reuse library metadata and full-size pin photos. No API calls are
// needed to decorate a library-wide job, and downloads are bounded.
export function progressArtwork(tracks = [], pins = [], { limit = 12, random = Math.random } = {}) {
  const shuffle = values => {
    const result = [...new Set(values.filter(Boolean))];
    for (let i=result.length-1;i>0;i--) {
      const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  };
  const photos=shuffle(pins.map(pin=>pin.image_url_large));
  const covers=shuffle(tracks.map(track=>{
    const images=track.album?.images || [];
    return images.reduce((best,image)=>(image.width||0)>(best?.width||0)?image:best,images[0])?.url;
  }));
  return [...new Set([...photos,...covers])].slice(0,limit);
}
