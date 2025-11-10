const mongoose=require('mongoose');

const techicianwork=new mongoose.Schema({
    technicianId:{type: Schema.Types.ObjectId, ref:'tech',},
    workId:{type: Schema.Types.ObjectId, ref:'Work',},
    workcount:{type:Number,required:true},
    countopen:{type:Number, required:true},
    
})

module.exports=mongoose.model('tech',techicianwork)