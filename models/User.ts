import mongoose, { Schema, model, models, Document, Model } from 'mongoose';

export interface IUser {
    username: string;
    password: string;
}

export interface IUserDocument extends IUser, Document {}

const UserSchema = new Schema<IUser>({
    username: {
        type: String,
        required: [true, 'Please provide a username.'],
        unique: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password for this user.'],
    },
});

const User: Model<IUser> = models.User || model<IUser>('User', UserSchema);
export default User;
