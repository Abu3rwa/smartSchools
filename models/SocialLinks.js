import mongoose from "mongoose";    

const SocialLinksSchema = new mongoose.Schema({
    school:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "School"
    },
  //array of links with name and url
    links:[{
        name: String,
        url: String,
        icon: String,
        color: String
    }],
    
    
    
}, { timestamps: true });

export default mongoose.model("SocialLinks", SocialLinksSchema);