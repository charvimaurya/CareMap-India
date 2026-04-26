import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, Clock, MapPin } from 'lucide-react';

interface HeroProps {
  onStart: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onStart }) => {
  return (
    <motion.section 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="relative py-20 px-4"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 -z-10" />
      <div className="max-w-5xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent rounded-full text-sm font-bold uppercase tracking-wider">
            24/7 Smart Health Navigation
          </span>
          <h2 className="text-5xl md:text-6xl font-display font-bold text-primary leading-tight">
            Finding the right medical care should be <span className="text-accent italic">fast & simple.</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-slate-600 leading-relaxed">
            CareMap India helps you triage your symptoms and find the nearest qualified medical facility in seconds. No more confusion, just clear directions.
          </p>
        </div>

        <div className="flex justify-center">
          <button onClick={onStart} className="btn-primary flex items-center justify-center gap-2 text-lg">
            Start Triage Now <ArrowRight size={20} />
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 pt-20">
          {[
            { icon: ShieldCheck, title: "Verified Facilities", desc: "We only list government-verified hospitals and registered clinics." },
            { icon: Clock, title: "Real-time Triage", desc: "Instant classification of symptoms into Emergency, Urgent, or Routine." },
            { icon: MapPin, title: "Location Smart", desc: "Automatically maps you to the best facility based on your current zone." }
          ].map((feat, i) => (
            <div key={i} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-left hover:shadow-md transition-all">
              <div className="bg-slate-50 w-12 h-12 rounded-xl flex items-center justify-center text-primary mb-6">
                <feat.icon size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{feat.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
};
